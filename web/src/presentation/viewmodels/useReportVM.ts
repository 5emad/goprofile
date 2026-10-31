import { useMemo, useState } from 'react'
import { boardRepo, taskRepo, worklogRepo } from '@/data/repositories'
import { addDays, dayKey, diffDays } from '@/domain/dates'
import type { Meta } from '@/domain/entities'
import { buildReport, groupTasks, inRange, insights, previousName, rangeOf, shiftRange, type Period } from '@/domain/report'
import { fmtDuration } from '@/domain/dates'
import { useApp, useTz } from '../store'
import { useAsync } from './useAsync'

export function useReportVM() {
  const tz = useTz()
  const { version, user } = useApp()
  const today = dayKey(new Date(), tz)
  const goal = user!.settings.daily_goal_minutes * 60
  const [period, setPeriod] = useState<Period>('week')
  const [anchor, setAnchor] = useState(today)
  const range = useMemo(() => rangeOf(period, anchor), [period, anchor])
  const prevRange = useMemo(() => shiftRange(range, -1), [range])
  // A running period is compared with the same number of days at the start of the previous one.
  const partial = inRange(today, range) && today < range.to
  const cmpRange = useMemo(() => {
    if (!partial) return prevRange
    const to = addDays(prevRange.from, diffDays(today, range.from))
    return { ...prevRange, to: to < prevRange.to ? to : prevRange.to }
  }, [partial, prevRange, range.from, today])
  const prevName = partial ? `مدت مشابه ${previousName(period)}` : previousName(period)

  const logs = useAsync(() => worklogRepo.range(range.from, range.to), [range.from, range.to, version])
  const prevLogs = useAsync(() => worklogRepo.range(prevRange.from, prevRange.to), [prevRange.from, prevRange.to, version])
  const tasks = useAsync(() => taskRepo.list(), [version])
  const boards = useAsync(() => boardRepo.list(), [version])

  const report = useMemo(() => (logs.data ? buildReport(range, logs.data, tz, goal, today) : null), [logs.data, range, tz, goal, today])
  const prev = useMemo(() => (prevLogs.data ? buildReport(cmpRange, prevLogs.data, tz, goal) : null), [prevLogs.data, cmpRange, tz, goal])
  const groups = useMemo(() => groupTasks(tasks.data ?? [], range, today, tz), [tasks.data, range, today, tz])
  const notes = useMemo(() => (report ? insights(report, prev, groups, goal, (s) => fmtDuration(s), prevName) : []), [report, prev, groups, goal, prevName])
  const statuses = useMemo(() => {
    const m = new Map<number, Meta>()
    for (const b of boards.data ?? []) for (const s of b.statuses) m.set(s.id, s)
    return m
  }, [boards.data])

  return {
    period,
    setPeriod,
    range,
    today,
    goal,
    isCurrent: inRange(today, range),
    prev: () => setAnchor(shiftRange(range, -1).from),
    next: () => setAnchor(shiftRange(range, 1).from),
    goToday: () => setAnchor(today),
    /** Opens the given day in the daily report. */
    openDay: (k: string) => {
      setPeriod('day')
      setAnchor(k)
    },
    loading: logs.loading || tasks.loading,
    error: logs.error ?? tasks.error,
    report,
    prevReport: prev,
    prevName,
    groups,
    notes,
    statuses,
    boards: boards.data ?? [],
  }
}
