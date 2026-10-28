import { describe, expect, it } from 'vitest'
import { toGregorian, toJalali, jalaliMonthLength } from './jalali'
import { addDays, weekday, zonedToDate, dayKey } from './dates'
import { buildGrid, summarize, monthly } from './activity'

describe('jalali', () => {
  it('converts known dates', () => {
    expect(toJalali(2025, 3, 21)).toEqual({ jy: 1404, jm: 1, jd: 1 })
    expect(toJalali(2026, 10, 28)).toEqual({ jy: 1405, jm: 8, jd: 6 })
    expect(toGregorian(1405, 8, 6)).toEqual({ gy: 2026, gm: 10, gd: 28 })
    expect(jalaliMonthLength(1403, 12)).toBe(30)
    expect(jalaliMonthLength(1404, 12)).toBe(29)
  })
})

describe('dates', () => {
  it('handles weekdays and zones', () => {
    expect(weekday('2026-10-24')).toBe(0) // Saturday
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    const d = zonedToDate('2026-10-28', '09:30', 'Asia/Tehran')
    expect(d.toISOString()).toBe('2026-10-28T06:00:00.000Z')
    expect(dayKey(d, 'Asia/Tehran')).toBe('2026-10-28')
  })
})

describe('activity', () => {
  const days = [
    { d: '2026-10-25', created: 1, done: 0, logs: 1, seconds: 3600 },
    { d: '2026-10-26', created: 0, done: 1, logs: 2, seconds: 7200 },
    { d: '2026-10-27', created: 0, done: 0, logs: 1, seconds: 600 },
    { d: '2026-09-01', created: 5, done: 0, logs: 0, seconds: 0 },
  ]
  it('summarizes streaks', () => {
    const s = summarize(days, '2026-10-28')
    expect(s.total).toBe(11)
    expect(s.busiest?.key).toBe('2026-09-01')
    expect(s.longest).toEqual({ length: 3, from: '2026-10-25', to: '2026-10-27' })
    expect(s.current?.length).toBe(3)
    expect(summarize(days, '2026-10-30').current).toBeNull()
  })
  it('builds a saturday-first grid', () => {
    const g = buildGrid(days, '2026-10-28')
    expect(g.weeks).toHaveLength(53)
    expect(weekday(g.weeks[0][0].key)).toBe(0)
    expect(g.weeks[52].some((c) => c.key === '2026-10-28')).toBe(true)
  })
  it('buckets by jalali month', () => {
    const m = monthly(days, '2026-10-28')
    expect(m[11]).toMatchObject({ jy: 1405, jm: 8, seconds: 11400 })
  })
})
