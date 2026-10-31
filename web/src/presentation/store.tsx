// App-wide view state: the signed-in user, theme and the running timer.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  stopTimer: (note?: string, complete?: boolean) => Promise<void>
  timerBusy: boolean
  /** Bumped whenever tasks or logs change so open views can reload. */
  version: number
  bump: () => void
  toast: (msg: string, kind?: 'ok' | 'err' | 'info') => void
}

const Ctx = createContext<AppState | null>(null)

export function useApp() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp outside provider')
  return c
}

export function AppProvider({ children, onToast }: { children: ReactNode; onToast: (m: string, k: 'ok' | 'err' | 'info') => void }) {
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

  const toast = useCallback((m: string, k: 'ok' | 'err' | 'info' = 'ok') => onToast(m, k), [onToast])

  // One timer request at a time: extra clicks while it is in flight are ignored.
  const [timerBusy, setTimerBusy] = useState(false)
  const inFlight = useRef(false)
  const exclusive = useCallback(async (fn: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    setTimerBusy(true)
    try {
      await fn()
    } finally {
      inFlight.current = false
      setTimerBusy(false)
    }
  }, [])

  const startTimer = useCallback(
    (taskId: number) =>
      exclusive(async () => {
        setTimer(await worklogRepo.start(taskId))
        bump()
      }),
    [bump, exclusive],
  )

  const stopTimer = useCallback(
    (note = '', complete = false) =>
      exclusive(async () => {
        await worklogRepo.stop(note, complete)
        setTimer(null)
        bump()
      }),
    [bump, exclusive],
  )

  const value = useMemo(
    () => ({ user, loading, setUser, timer, timerBusy, refreshTimer, startTimer, stopTimer, version, bump, toast }),
    [user, loading, timer, timerBusy, refreshTimer, startTimer, stopTimer, version, bump, toast],
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
