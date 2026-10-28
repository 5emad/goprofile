// Day keys are "YYYY-MM-DD" strings in the user's timezone.
import { MONTHS, WEEKDAYS, toGregorian, toJalali } from './jalali'

export type DayKey = string

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function partsFmt(tz: string) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    fmtCache.set(tz, f)
  }
  return f
}

function zoned(d: Date, tz: string) {
  const p: Record<string, number> = {}
  for (const x of partsFmt(tz).formatToParts(d)) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function dayKey(d: Date, tz: string): DayKey {
  const p = zoned(d, tz)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function parseKey(k: DayKey) {
  const [y, m, d] = k.split('-').map(Number)
  return { y, m, d }
}

export function addDays(k: DayKey, n: number): DayKey {
  const { y, m, d } = parseKey(k)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

export function diffDays(a: DayKey, b: DayKey) {
  const pa = parseKey(a)
  const pb = parseKey(b)
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86400000)
}

/** Weekday with Saturday = 0. */
export function weekday(k: DayKey) {
  const { y, m, d } = parseKey(k)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 1) % 7
}

export const startOfWeek = (k: DayKey) => addDays(k, -weekday(k))

export function jalaliOf(k: DayKey) {
  const { y, m, d } = parseKey(k)
  return toJalali(y, m, d)
}

export function keyFromJalali(jy: number, jm: number, jd: number): DayKey {
  const g = toGregorian(jy, jm, jd)
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`
}

export function fmtDay(k: DayKey, withYear = false) {
  const j = jalaliOf(k)
  return `${j.jd} ${MONTHS[j.jm - 1]}${withYear ? ` ${j.jy}` : ''}`
}

export function fmtDayLong(k: DayKey) {
  return `${WEEKDAYS[weekday(k)]} ${fmtDay(k, true)}`
}

/** Converts a wall-clock time in tz to an absolute Date. */
export function zonedToDate(k: DayKey, hhmm: string, tz: string): Date {
  const { y, m, d } = parseKey(k)
  const [h, mi] = hhmm.split(':').map(Number)
  const want = Date.UTC(y, m - 1, d, h, mi)
  let t = want
  for (let i = 0; i < 2; i++) {
    const p = zoned(new Date(t), tz)
    const got = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    t += want - got
  }
  return new Date(t)
}

export function fmtTime(d: Date | string, tz: string) {
  const p = zoned(typeof d === 'string' ? new Date(d) : d, tz)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/** Minutes since local midnight in tz. */
export function minuteOfDay(d: Date | string, tz: string) {
  const p = zoned(typeof d === 'string' ? new Date(d) : d, tz)
  return p.hour * 60 + p.minute + p.second / 60
}

export function fmtDuration(seconds: number, short = false) {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (short) return h ? `${h}:${pad(m)}` : `${m}د`
  if (!h && !m) return 'کمتر از ۱ دقیقه'
  return [h ? `${h} ساعت` : '', m ? `${m} دقیقه` : ''].filter(Boolean).join(' و ')
}

export function fmtClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

export function hoursLabel(seconds: number) {
  const h = seconds / 3600
  return h >= 10 ? h.toFixed(0) : h.toFixed(1).replace(/\.0$/, '')
}
