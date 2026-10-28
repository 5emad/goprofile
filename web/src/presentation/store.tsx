// App-wide view state: the signed-in user, theme and the running timer.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { session } from '@/core/http'
import { authRepo, worklogRepo } from '@/data/repositories'
import type { User, Worklog } from '@/domain/entities'

interface AppState {
  user: User | null
  loading: boolean
  setUser: (u: User | null) => void
  timer: Worklog | null
  refreshTimer: () => Promise<void>
  startTimer: (taskId: number) => Promise<void>
  stopTimer: (note?: string) => Promise<void>
  /** Bumped whenever tasks or logs change so open views can reload. */
  version: number
  bump: () => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

const Ctx = createContext<AppState | null>(null)

export function useApp() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp outside provider')
  return c
}

export function AppProvider({ children, onToast }: { children: ReactNode; onToast: (m: string, k: 'ok' | 'err') => void }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!session.token)
  const [timer, setTimer] = useState<Worklog | null>(null)
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    if (!session.token) return
    authRepo
      .me()
      .then(setUser)
      .catch(() => session.set(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => session.subscribe(() => !session.token && setUser(null)), [])

  const refreshTimer = useCallback(async () => {
    setTimer(await worklogRepo.timer())
  }, [])

  useEffect(() => {
    if (!user) return
    refreshTimer().catch(() => {})
    const id = setInterval(() => refreshTimer().catch(() => {}), 60_000)
    return () => clearInterval(id)
  }, [user, refreshTimer])

  useEffect(() => {
    const t = user?.settings.theme ?? 'system'
    if (t === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', t)
  }, [user?.settings.theme])

  const toast = useCallback((m: string, k: 'ok' | 'err' = 'ok') => onToast(m, k), [onToast])

  const startTimer = useCallback(
    async (taskId: number) => {
      setTimer(await worklogRepo.start(taskId))
      bump()
    },
    [bump],
  )

  const stopTimer = useCallback(
    async (note = '') => {
      await worklogRepo.stop(note)
      setTimer(null)
      bump()
    },
    [bump],
  )

  const value = useMemo(
    () => ({ user, loading, setUser, timer, refreshTimer, startTimer, stopTimer, version, bump, toast }),
    [user, loading, timer, refreshTimer, startTimer, stopTimer, version, bump, toast],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Seconds elapsed on the running timer, ticking every second. */
export function useElapsed(startedAt: string | null | undefined) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return startedAt ? Math.max(0, (now - new Date(startedAt).getTime()) / 1000) : 0
}

export function useTz() {
  return useApp().user?.settings.timezone ?? 'Asia/Tehran'
}
