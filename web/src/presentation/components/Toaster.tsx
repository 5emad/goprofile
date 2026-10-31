// Top-center notifications. A message that is already on screen is not
// repeated: it restarts its timer and nudges instead, so clicking the same
// button again and again never stacks copies.
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export type ToastKind = 'ok' | 'err' | 'info'

interface Toast {
  id: number
  msg: string
  kind: ToastKind
  count: number
  /** Bumped on every repeat to replay the nudge and restart the timer. */
  rev: number
  leaving: boolean
}

const DURATION: Record<ToastKind, number> = { ok: 3200, info: 3600, err: 5200 }
const MAX = 3

let toasts: Toast[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const set = (next: Toast[]) => {
  toasts = next
  emit()
}

export function toast(msg: string, kind: ToastKind = 'ok') {
  const same = toasts.find((t) => t.msg === msg && t.kind === kind && !t.leaving)
  if (same) {
    set(toasts.map((t) => (t === same ? { ...t, count: t.count + 1, rev: t.rev + 1 } : t)))
    return
  }
  const next = [...toasts.filter((t) => !t.leaving), { id: ++seq, msg, kind, count: 1, rev: 0, leaving: false }]
  // Keep at most MAX on screen; the oldest leaves first.
  const extra = next.filter((t) => !t.leaving).length - MAX
  set(next.map((t, i) => (i < extra ? { ...t, leaving: true } : t)))
}

function dismiss(id: number) {
  set(toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
}

function remove(id: number) {
  set(toasts.filter((t) => t.id !== id))
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

const ICONS: Record<ToastKind, string> = { ok: 'check', err: 'close', info: 'flag' }

function Item({ t }: { t: Toast }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const left = useRef(DURATION[t.kind])
  const startedAt = useRef(0)
  const bar = useRef<HTMLDivElement>(null)

  const start = () => {
    startedAt.current = Date.now()
    timer.current = setTimeout(() => dismiss(t.id), left.current)
    bar.current?.getAnimations().forEach((a) => a.play())
  }
  const pause = () => {
    clearTimeout(timer.current)
    left.current -= Date.now() - startedAt.current
    bar.current?.getAnimations().forEach((a) => a.pause())
  }

  useEffect(() => {
    clearTimeout(timer.current)
    left.current = DURATION[t.kind]
    start()
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.rev])

  return (
    <div
      className={`toast toast-${t.kind} ${t.leaving ? 'leaving' : ''} ${t.rev ? 'nudge' : ''}`}
      key={t.rev}
      role={t.kind === 'err' ? 'alert' : 'status'}
      onMouseEnter={pause}
      onMouseLeave={start}
      onAnimationEnd={(e) => e.animationName === 'toast-out' && remove(t.id)}
    >
      <span className="toast-icon">
        <Icon name={ICONS[t.kind]} size={14} />
      </span>
      <span className="toast-msg">{t.msg}</span>
      {t.count > 1 && <span className="toast-count">×{t.count}</span>}
      <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="بستن">
        <Icon name="close" size={14} />
      </button>
      <div className="toast-bar" ref={bar} style={{ animationDuration: `${DURATION[t.kind]}ms` }} key={`bar${t.rev}`} />
    </div>
  )
}

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts)
  return createPortal(
    <div className="toaster" aria-live="polite">
      {list.map((t) => (
        <Item key={t.id} t={t} />
      ))}
    </div>,
    document.body,
  )
}
