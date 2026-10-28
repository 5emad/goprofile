import { addDays, diffDays, jalaliOf, startOfWeek, type DayKey } from './dates'
import type { DayStat } from './entities'

export interface Cell {
  key: DayKey
  count: number
  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}

export interface ActivityGrid {
  weeks: Cell[][]
  monthLabels: { week: number; month: number }[]
  max: number
}

export const contributions = (d: DayStat) => d.created + d.done + d.logs

export function levelOf(count: number, max: number): Cell['level'] {
  if (count <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4))) as Cell['level']
}

/** Builds a Saturday-first grid of `weeks` columns ending with the week of today. */
export function buildGrid(days: DayStat[], today: DayKey, weeks = 53): ActivityGrid {
  const counts = new Map(days.map((d) => [d.d, contributions(d)]))
  const max = Math.max(0, ...counts.values())
  const first = addDays(startOfWeek(today), -(weeks - 1) * 7)
  const grid: Cell[][] = []
  const monthLabels: ActivityGrid['monthLabels'] = []
  let lastMonth = -1
  for (let w = 0; w < weeks; w++) {
    const col: Cell[] = []
    for (let d = 0; d < 7; d++) {
      const key = addDays(first, w * 7 + d)
      const count = counts.get(key) ?? 0
      col.push({ key, count, level: levelOf(count, max), future: diffDays(key, today) > 0 })
    }
    const m = jalaliOf(col[0].key).jm
    if (m !== lastMonth) {
      if (w < weeks - 1 || lastMonth === -1) monthLabels.push({ week: w, month: m })
      lastMonth = m
    }
    grid.push(col)
  }
  // Drop a label squeezed into the very first column.
  if (monthLabels.length > 1 && monthLabels[1].week - monthLabels[0].week < 2) monthLabels.shift()
  return { weeks: grid, monthLabels, max }
}

export interface Summary {
  total: number
  busiest: { key: DayKey; count: number } | null
  longest: { length: number; from: DayKey; to: DayKey } | null
  current: { length: number; from: DayKey; to: DayKey } | null
}

export function summarize(days: DayStat[], today: DayKey): Summary {
  const active = days.filter((d) => contributions(d) > 0).sort((a, b) => a.d.localeCompare(b.d))
  let total = 0
  let busiest: Summary['busiest'] = null
  let longest: Summary['longest'] = null
  let run: { length: number; from: DayKey; to: DayKey } | null = null
  for (const d of active) {
    const c = contributions(d)
    total += c
    if (!busiest || c > busiest.count) busiest = { key: d.d, count: c }
    if (run && diffDays(d.d, run.to) === 1) run = { length: run.length + 1, from: run.from, to: d.d }
    else run = { length: 1, from: d.d, to: d.d }
    if (!longest || run.length > longest.length) longest = run
  }
  // The current streak survives until the end of today.
  const current = run && diffDays(today, run.to) <= 1 ? run : null
  return { total, busiest, longest, current }
}

export interface MonthBucket {
  jy: number
  jm: number
  seconds: number
  done: number
  contributions: number
}

/** Groups the last `count` Jalali months, oldest first. */
export function monthly(days: DayStat[], today: DayKey, count = 12): MonthBucket[] {
  const t = jalaliOf(today)
  const out: MonthBucket[] = []
  for (let i = count - 1; i >= 0; i--) {
    let jm = t.jm - i
    let jy = t.jy
    while (jm < 1) {
      jm += 12
      jy -= 1
    }
    out.push({ jy, jm, seconds: 0, done: 0, contributions: 0 })
  }
  const index = new Map(out.map((b, i) => [`${b.jy}-${b.jm}`, i]))
  for (const d of days) {
    const j = jalaliOf(d.d)
    const i = index.get(`${j.jy}-${j.jm}`)
    if (i === undefined) continue
    out[i].seconds += d.seconds
    out[i].done += d.done
    out[i].contributions += contributions(d)
  }
  return out
}

export interface Compare {
  today: number
  yesterday: number
  /** Percent change, or null when yesterday was zero. */
  delta: number | null
}

export function compare(today: number, yesterday: number): Compare {
  return { today, yesterday, delta: yesterday === 0 ? null : Math.round(((today - yesterday) / yesterday) * 100) }
}

export function dayOf(days: DayStat[], key: DayKey): DayStat {
  return days.find((d) => d.d === key) ?? { d: key, created: 0, done: 0, logs: 0, seconds: 0 }
}
