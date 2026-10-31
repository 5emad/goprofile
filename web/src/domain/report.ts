// Period reports (day, week, Jalali month, Jalali year) and due-date rules.
import { addDays, diffDays, dayKey, fmtDay, fmtDayLong, jalaliOf, keyFromJalali, minuteOfDay, weekday, type DayKey } from './dates'
import type { Task, Worklog } from './entities'
import { MONTHS, jalaliMonthLength } from './jalali'

export type Period = 'day' | 'week' | 'month' | 'year'

export const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'روزانه' },
  { value: 'week', label: 'هفتگی' },
  { value: 'month', label: 'ماهانه' },
  { value: 'year', label: 'سالانه' },
]

export interface Range {
  period: Period
  from: DayKey
  to: DayKey
  label: string
}

export function rangeOf(period: Period, anchor: DayKey): Range {
  const j = jalaliOf(anchor)
  switch (period) {
    case 'day':
      return { period, from: anchor, to: anchor, label: fmtDayLong(anchor) }
    case 'week': {
      const from = addDays(anchor, -weekday(anchor))
      const to = addDays(from, 6)
      return { period, from, to, label: `${fmtDay(from)} تا ${fmtDay(to, true)}` }
    }
    case 'month':
      return {
        period,
        from: keyFromJalali(j.jy, j.jm, 1),
        to: keyFromJalali(j.jy, j.jm, jalaliMonthLength(j.jy, j.jm)),
        label: `${MONTHS[j.jm - 1]} ${j.jy}`,
      }
    case 'year':
      return { period, from: keyFromJalali(j.jy, 1, 1), to: keyFromJalali(j.jy, 12, jalaliMonthLength(j.jy, 12)), label: `سال ${j.jy}` }
  }
}

/** The range n periods before (negative) or after (positive) r. */
export function shiftRange(r: Range, n: number): Range {
  let anchor = r.from
  for (let i = 0; i < Math.abs(n); i++) anchor = n < 0 ? addDays(rangeOf(r.period, anchor).from, -1) : addDays(rangeOf(r.period, anchor).to, 1)
  return rangeOf(r.period, anchor)
}

export const inRange = (k: DayKey, r: Pick<Range, 'from' | 'to'>) => k >= r.from && k <= r.to
export const rangeDays = (r: Pick<Range, 'from' | 'to'>) => Array.from({ length: diffDays(r.to, r.from) + 1 }, (_, i) => addDays(r.from, i))

// ---------- due dates ----------

/** Open tasks due within this many days are flagged as near. */
export const SOON_DAYS = 3

export type DueState = 'overdue' | 'today' | 'soon' | 'later'

export function dueState(t: Pick<Task, 'due_on' | 'done_at'>, today: DayKey): DueState | null {
  if (!t.due_on || t.done_at) return null
  const left = diffDays(t.due_on, today)
  if (left < 0) return 'overdue'
  if (left === 0) return 'today'
  return left <= SOON_DAYS ? 'soon' : 'later'
}

export function dueLabel(t: Pick<Task, 'due_on' | 'done_at'>, today: DayKey) {
  const s = dueState(t, today)
  if (!s) return ''
  const left = diffDays(t.due_on!, today)
  if (s === 'overdue') return `${-left} روز گذشته`
  if (s === 'today') return 'سررسید امروز'
  return `${left} روز مانده`
}

export interface TaskGroups {
  overdue: Task[]
  soon: Task[]
  open: Task[]
  done: Task[]
  created: Task[]
}

/** Splits tasks into the groups a report lists. `done` and `created` are limited to the range. */
export function groupTasks(tasks: Task[], r: Pick<Range, 'from' | 'to'>, today: DayKey, tz: string): TaskGroups {
  const byDue = (a: Task, b: Task) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || b.priority - a.priority
  const open = tasks.filter((t) => !t.done_at).sort(byDue)
  return {
    overdue: open.filter((t) => dueState(t, today) === 'overdue'),
    soon: open.filter((t) => ['today', 'soon'].includes(dueState(t, today) ?? '')),
    open,
    done: tasks.filter((t) => t.done_at && inRange(dayKey(new Date(t.done_at), tz), r)).sort((a, b) => b.done_at!.localeCompare(a.done_at!)),
    created: tasks.filter((t) => inRange(dayKey(new Date(t.created_at), tz), r)),
  }
}

// ---------- work time ----------

export interface Bucket {
  key: string
  label: string
  sub?: string
  seconds: number
  logs: number
}

export interface TaskTotal {
  taskId: number
  key: string
  jiraKey: string
  title: string
  board: string
  seconds: number
  logs: number
}

export interface DayLogs {
  key: DayKey
  logs: Worklog[]
  seconds: number
  first: string | null
  last: string | null
}

export interface PeriodReport {
  range: Range
  total: number
  logs: number
  workDays: number
  /** Days of the range up to today (all of them for a past range). */
  elapsedDays: number
  avgPerWorkDay: number
  goalDays: number
  timerSeconds: number
  manualSeconds: number
  days: DayLogs[]
  buckets: Bucket[]
  tasks: TaskTotal[]
  boards: { name: string; seconds: number }[]
  weekdays: number[]
  hours: number[]
  longest: Worklog | null
  bestDay: DayLogs | null
  avgStart: number | null
  avgEnd: number | null
  /** Earliest start and latest end over all days, in minutes, padded to whole hours. */
  window: { from: number; to: number }
}

const endOf = (l: Worklog) => l.ended_at ?? new Date(new Date(l.started_at).getTime() + l.seconds * 1000).toISOString()

/** Adds a log's seconds to the 24 hour slots it covers (clamped at midnight). */
function spreadHours(hours: number[], l: Worklog, tz: string) {
  let m = minuteOfDay(l.started_at, tz)
  let left = l.seconds / 60
  while (left > 0 && m < 1440) {
    const h = Math.floor(m / 60)
    const take = Math.min(left, (h + 1) * 60 - m)
    hours[h] += take * 60
    left -= take
    m += take
  }
}

export function buildReport(range: Range, logs: Worklog[], tz: string, goalSeconds: number, today?: DayKey): PeriodReport {
  const days: DayLogs[] = rangeDays(range).map((key) => ({ key, logs: [], seconds: 0, first: null, last: null }))
  const index = new Map(days.map((d, i) => [d.key, i]))
  const tasks = new Map<number, TaskTotal>()
  const boards = new Map<string, number>()
  const weekdays = Array(7).fill(0)
  const hours = Array(24).fill(0)
  let timerSeconds = 0
  let longest: Worklog | null = null
  let count = 0

  for (const l of logs) {
    const key = dayKey(new Date(l.started_at), tz)
    const i = index.get(key)
    if (i === undefined) continue
    count++
    const d = days[i]
    d.logs.push(l)
    d.seconds += l.seconds
    if (!d.first || l.started_at < d.first) d.first = l.started_at
    if (!d.last || endOf(l) > d.last) d.last = endOf(l)
    let t = tasks.get(l.task_id)
    if (!t) tasks.set(l.task_id, (t = { taskId: l.task_id, key: l.task_key, jiraKey: l.jira_key, title: l.task_title, board: l.board_name, seconds: 0, logs: 0 }))
    t.seconds += l.seconds
    t.logs++
    boards.set(l.board_name, (boards.get(l.board_name) ?? 0) + l.seconds)
    weekdays[weekday(key)] += l.seconds
    spreadHours(hours, l, tz)
    if (l.source === 'timer') timerSeconds += l.seconds
    if (!longest || l.seconds > longest.seconds) longest = l
  }

  const total = days.reduce((s, d) => s + d.seconds, 0)
  const worked = days.filter((d) => d.seconds > 0)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

  let buckets: Bucket[]
  if (range.period === 'day') {
    buckets = hours.map((s, h) => ({ key: String(h), label: String(h).padStart(2, '0'), seconds: s, logs: 0 }))
  } else if (range.period === 'year') {
    buckets = MONTHS.map((label, i) => ({ key: String(i + 1), label, seconds: 0, logs: 0 }))
    for (const d of days) {
      const b = buckets[jalaliOf(d.key).jm - 1]
      b.seconds += d.seconds
      b.logs += d.logs.length
    }
  } else {
    buckets = days.map((d) => ({
      key: d.key,
      label: range.period === 'week' ? ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'][weekday(d.key)] : String(jalaliOf(d.key).jd),
      sub: fmtDay(d.key),
      seconds: d.seconds,
      logs: d.logs.length,
    }))
  }

  let lo = 24 * 60
  let hi = 0
  for (const d of worked) {
    for (const l of d.logs) {
      const s = minuteOfDay(l.started_at, tz)
      lo = Math.min(lo, s)
      hi = Math.max(hi, Math.min(1440, s + l.seconds / 60))
    }
  }
  const window = worked.length ? { from: Math.floor(lo / 60) * 60, to: Math.ceil(hi / 60) * 60 } : { from: 8 * 60, to: 18 * 60 }
  if (window.to - window.from < 120) window.to = Math.min(1440, window.from + 120)
  if (window.to - window.from < 120) window.from = window.to - 120

  return {
    range,
    total,
    logs: count,
    workDays: worked.length,
    elapsedDays: today ? days.filter((d) => d.key <= today).length : days.length,
    avgPerWorkDay: worked.length ? total / worked.length : 0,
    goalDays: goalSeconds > 0 ? worked.filter((d) => d.seconds >= goalSeconds).length : 0,
    timerSeconds,
    manualSeconds: total - timerSeconds,
    days,
    buckets,
    tasks: [...tasks.values()].sort((a, b) => b.seconds - a.seconds),
    boards: [...boards].map(([name, seconds]) => ({ name, seconds })).sort((a, b) => b.seconds - a.seconds),
    weekdays,
    hours,
    longest,
    bestDay: worked.reduce<DayLogs | null>((a, d) => (!a || d.seconds > a.seconds ? d : a), null),
    avgStart: avg(worked.map((d) => minuteOfDay(d.first!, tz))),
    avgEnd: avg(worked.map((d) => minuteOfDay(d.last!, tz))),
    window,
  }
}

/** Percent change from prev to cur, or null when there is nothing to compare with. */
export function delta(cur: number, prev: number) {
  if (!prev) return null
  return Math.round(((cur - prev) / prev) * 100)
}

const PERIOD_NAME: Record<Period, string> = { day: 'دیروز', week: 'هفته قبل', month: 'ماه قبل', year: 'سال قبل' }
export const previousName = (p: Period) => PERIOD_NAME[p]

const hm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`

/** Short Persian observations about a report. */
export function insights(r: PeriodReport, prev: PeriodReport | null, groups: TaskGroups, goalSeconds: number, fmt: (s: number) => string, prevName = previousName(r.range.period)): string[] {
  const out: string[] = []
  if (!r.total) {
    out.push('در این بازه زمان کاری ثبت نشده است.')
  } else {
    const d = prev ? delta(r.total, prev.total) : null
    if (d !== null) out.push(`زمان کار نسبت به ${prevName} ${d >= 0 ? `${d}٪ بیشتر` : `${-d}٪ کمتر`} بوده است (${fmt(prev!.total)} ← ${fmt(r.total)}).`)
    if (r.range.period !== 'day') {
      out.push(`در ${r.workDays} روز از ${r.elapsedDays} روز${r.elapsedDays < r.days.length ? ' سپری‌شده' : ''} کار ثبت شده؛ میانگین هر روز کاری ${fmt(r.avgPerWorkDay)}.`)
      if (goalSeconds > 0) out.push(`هدف روزانه (${fmt(goalSeconds)}) در ${r.goalDays} روز محقق شده است.`)
      if (r.bestDay) out.push(`پرکارترین روز ${fmtDayLong(r.bestDay.key)} با ${fmt(r.bestDay.seconds)} بود.`)
    }
    if (r.avgStart !== null && r.avgEnd !== null) out.push(`شروع کار به‌طور میانگین ساعت ${hm(r.avgStart)} و پایان آن ${hm(r.avgEnd)} بوده است.`)
    const peak = r.hours.indexOf(Math.max(...r.hours))
    if (r.hours[peak] > 0) out.push(`بیشترین تمرکز بین ساعت ${String(peak).padStart(2, '0')} تا ${String(peak + 1).padStart(2, '0')} بوده است.`)
    if (r.tasks[0]) out.push(`بیشترین زمان صرف «${r.tasks[0].title}» شد (${Math.round((r.tasks[0].seconds / r.total) * 100)}٪ کل زمان).`)
    if (r.longest && r.longest.seconds >= 1800) out.push(`طولانی‌ترین بازه پیوسته ${fmt(r.longest.seconds)} روی «${r.longest.task_title}» بود.`)
    out.push(`${Math.round((r.timerSeconds / r.total) * 100)}٪ زمان با تایمر و بقیه به‌صورت دستی ثبت شده است.`)
  }
  if (groups.done.length) out.push(`${groups.done.length} تسک در این بازه انجام شد.`)
  if (groups.overdue.length) out.push(`${groups.overdue.length} تسک از سررسیدش گذشته و نیاز به رسیدگی فوری دارد.`)
  if (groups.soon.length) out.push(`${groups.soon.length} تسک تا ${SOON_DAYS} روز آینده سررسید می‌شود.`)
  return out
}
