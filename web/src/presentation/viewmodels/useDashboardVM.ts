import { useMemo } from 'react'
import { statsRepo } from '@/data/repositories'
import { buildGrid, compare, dayOf, monthly, summarize } from '@/domain/activity'
import { addDays } from '@/domain/dates'
import { useApp, useElapsed } from '../store'
import { useAsync } from './useAsync'

export function useDashboardVM() {
  const { version, timer, user } = useApp()
  const stats = useAsync(() => statsRepo.daily(371), [version, user?.settings.timezone])
  const running = useElapsed(timer?.started_at)

  return useMemo(() => {
    const s = stats.data
    if (!s) return { loading: stats.loading, error: stats.error, ready: false as const }
    const today = dayOf(s.days, s.today)
    const yesterday = dayOf(s.days, addDays(s.today, -1))
    const todaySeconds = today.seconds + running
    const goal = (user?.settings.daily_goal_minutes ?? 0) * 60
    return {
      ready: true as const,
      loading: false,
      error: stats.error,
      today: s.today,
      from: s.from,
      grid: buildGrid(s.days, s.today),
      summary: summarize(s.days, s.today),
      months: monthly(s.days, s.today, 12),
      last14: Array.from({ length: 14 }, (_, i) => dayOf(s.days, addDays(s.today, i - 13))),
      time: compare(todaySeconds, yesterday.seconds),
      done: compare(today.done, yesterday.done),
      created: compare(today.created, yesterday.created),
      goal: goal ? Math.min(1, todaySeconds / goal) : null,
      goalSeconds: goal,
    }
  }, [stats.data, stats.loading, stats.error, running, user?.settings.daily_goal_minutes])
}
