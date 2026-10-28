import { useMemo, useState } from 'react'
import { worklogRepo } from '@/data/repositories'
import { addDays, dayKey, minuteOfDay, startOfWeek } from '@/domain/dates'
import type { Worklog } from '@/domain/entities'
import { useApp, useTz } from '../store'
import { useAsync } from './useAsync'

export interface DayReport {
  key: string
  logs: Worklog[]
  seconds: number
  first: Worklog | null
  last: Worklog | null
}

export interface TaskRow {
  taskId: number
  key: string
  jiraKey: string
  title: string
  board: string
  perDay: number[]
  total: number
}

export function useReportVM() {
  const tz = useTz()
  const { version } = useApp()
  const thisWeek = startOfWeek(dayKey(new Date(), tz))
  const [week, setWeek] = useState(thisWeek)
  const end = addDays(week, 6)
  const logs = useAsync(() => worklogRepo.range(week, end), [week, version, tz])

  const report = useMemo(() => {
    const list = logs.data ?? []
    const days: DayReport[] = Array.from({ length: 7 }, (_, i) => ({ key: addDays(week, i), logs: [], seconds: 0, first: null, last: null }))
    const rows = new Map<number, TaskRow>()
    for (const l of list) {
      const i = days.findIndex((d) => d.key === dayKey(new Date(l.started_at), tz))
      if (i < 0) continue
      const d = days[i]
      d.logs.push(l)
      d.seconds += l.seconds
      if (!d.first || l.started_at < d.first.started_at) d.first = l
      const endOf = (w: Worklog) => w.ended_at ?? new Date().toISOString()
      if (!d.last || endOf(l) > endOf(d.last)) d.last = l
      let row = rows.get(l.task_id)
      if (!row) {
        row = { taskId: l.task_id, key: l.task_key, jiraKey: l.jira_key, title: l.task_title, board: l.board_name, perDay: Array(7).fill(0), total: 0 }
        rows.set(l.task_id, row)
      }
      row.perDay[i] += l.seconds
      row.total += l.seconds
    }
    const total = days.reduce((s, d) => s + d.seconds, 0)
    // Timeline window: the earliest start to the latest end across the week, padded to whole hours.
    let lo = 24 * 60
    let hi = 0
    for (const l of list) {
      const s = minuteOfDay(l.started_at, tz)
      const e = s + l.seconds / 60
      lo = Math.min(lo, s)
      hi = Math.max(hi, e)
    }
    const window = list.length ? { from: Math.max(0, Math.floor(lo / 60) * 60), to: Math.min(24 * 60, Math.ceil(hi / 60) * 60) } : { from: 8 * 60, to: 18 * 60 }
    if (window.to - window.from < 120) window.to = Math.min(24 * 60, window.from + 120)
    return { days, rows: [...rows.values()].sort((a, b) => b.total - a.total), total, window }
  }, [logs.data, week, tz])

  return {
    week,
    end,
    isCurrent: week === thisWeek,
    prev: () => setWeek(addDays(week, -7)),
    next: () => setWeek(addDays(week, 7)),
    today: () => setWeek(thisWeek),
    loading: logs.loading,
    error: logs.error,
    reload: logs.reload,
    ...report,
  }
}
