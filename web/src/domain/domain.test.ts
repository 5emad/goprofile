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

describe('report', async () => {
  const { rangeOf, shiftRange, dueState, buildReport, groupTasks } = await import('./report')
  const log = (id: number, start: string, minutes: number, source: 'timer' | 'manual' = 'timer') => ({
    id, task_id: id % 2 ? 1 : 2, task_key: 'GP-1', jira_key: '', task_title: id % 2 ? 'a' : 'b', board_id: 1, board_name: 'B',
    started_at: start, ended_at: new Date(new Date(start).getTime() + minutes * 60000).toISOString(), seconds: minutes * 60, note: '', source,
  })

  it('builds Jalali ranges', () => {
    expect(rangeOf('week', '2026-10-28')).toMatchObject({ from: '2026-10-24', to: '2026-10-30' })
    expect(rangeOf('month', '2026-10-28')).toMatchObject({ from: '2026-10-23', to: '2026-11-21', label: 'آبان 1405' })
    expect(rangeOf('year', '2026-10-28')).toMatchObject({ from: '2026-03-21', to: '2027-03-20' })
    expect(shiftRange(rangeOf('month', '2026-10-28'), -1)).toMatchObject({ from: '2026-09-23', to: '2026-10-22' })
    expect(shiftRange(rangeOf('day', '2026-10-28'), 2).from).toBe('2026-10-30')
  })

  it('flags due dates', () => {
    expect(dueState({ due_on: '2026-10-27', done_at: null }, '2026-10-28')).toBe('overdue')
    expect(dueState({ due_on: '2026-10-28', done_at: null }, '2026-10-28')).toBe('today')
    expect(dueState({ due_on: '2026-10-31', done_at: null }, '2026-10-28')).toBe('soon')
    expect(dueState({ due_on: '2026-11-05', done_at: null }, '2026-10-28')).toBe('later')
    expect(dueState({ due_on: '2026-10-01', done_at: '2026-10-02T00:00:00Z' }, '2026-10-28')).toBeNull()
  })

  it('sums logs per day, hour and task', () => {
    const r = rangeOf('week', '2026-10-28')
    // 09:30–11:00 Tehran = 06:00–07:30 UTC
    const rep = buildReport(r, [log(1, '2026-10-25T06:00:00Z', 90), log(2, '2026-10-25T10:00:00Z', 30, 'manual'), log(3, '2026-11-02T06:00:00Z', 60)], 'Asia/Tehran', 3600)
    expect(rep.total).toBe(120 * 60)
    expect(rep.workDays).toBe(1)
    expect(rep.goalDays).toBe(1)
    expect(rep.hours[9]).toBe(30 * 60)
    expect(rep.hours[10]).toBe(60 * 60)
    expect(rep.manualSeconds).toBe(30 * 60)
    expect(rep.tasks[0].seconds).toBe(90 * 60)
    expect(rep.buckets).toHaveLength(7)
    expect(rep.window).toEqual({ from: 9 * 60, to: 14 * 60 })
  })

  it('groups tasks for the report', () => {
    const t = (id: number, due: string | null, done: string | null) => ({ id, due_on: due, done_at: done, created_at: '2026-10-25T08:00:00Z', priority: 2 }) as never
    const g = groupTasks([t(1, '2026-10-20', null), t(2, '2026-10-29', null), t(3, null, '2026-10-26T08:00:00Z')], rangeOf('week', '2026-10-28'), '2026-10-28', 'Asia/Tehran')
    expect(g.overdue).toHaveLength(1)
    expect(g.soon).toHaveLength(1)
    expect(g.open).toHaveLength(2)
    expect(g.done).toHaveLength(1)
    expect(g.created).toHaveLength(3)
  })
})
