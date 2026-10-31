import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { network } from '@/core/secure'
import { authRepo, taskRepo } from '@/data/repositories'
import { dayKey, fmtClock } from '@/domain/dates'
import { taskLabel } from '@/domain/entities'
import { dueState } from '@/domain/report'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { NavLink, routes } from '../nav'
import { useApp, useElapsed, useTz } from '../store'
import { useAsync } from '../viewmodels/useAsync'

const nav = [
  { to: routes.dashboard, icon: 'dashboard', label: 'داشبورد', end: true },
  { to: routes.boards, icon: 'board', label: 'کارتابل‌ها' },
  { to: routes.newTask(), icon: 'plus', label: 'ایجاد تسک' },
  { to: routes.reports, icon: 'report', label: 'گزارش‌ها' },
  { to: routes.settings, icon: 'settings', label: 'تنظیمات' },
  { to: routes.profile, icon: 'user', label: 'پروفایل' },
]

function TimerBar() {
  const { timer, timerBusy, stopTimer, toast, user } = useApp()
  const elapsed = useElapsed(timer?.started_at)
  if (!timer) return null
  return (
    <div className="timer-bar">
      <span className="pulse" />
      <span className="timer-task">
        <b>{taskLabel({ key: timer.task_key, jira_key: timer.jira_key }, user!.settings.jira_mode)}</b> {timer.task_title}
      </span>
      <span className="timer-clock ltr">{fmtClock(elapsed)}</span>
      <button
        className="btn btn-sm btn-done"
        disabled={timerBusy}
        title="توقف تایمر، ثبت لاگ و انتقال تسک به وضعیت انجام‌شده"
        onClick={() => stopTimer('', true).then(() => toast('لاگ ثبت و تسک تکمیل شد')).catch((e) => toast(e.message, 'err'))}
      >
        <Icon name="check" size={13} /> تکمیل
      </button>
      <button
        className="btn btn-sm btn-primary"
        disabled={timerBusy}
        onClick={() => stopTimer().then(() => toast('زمان کار ثبت شد')).catch((e) => toast(e.message, 'err'))}
      >
        <Icon name="stop" size={12} /> توقف و ثبت
      </button>
    </div>
  )
}

/** Shown while the server cannot be reached (offline or server down). */
function NetBanner() {
  const reachable = useSyncExternalStore(network.subscribe, () => network.reachable, () => true)
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])
  if (online && reachable) return null
  return (
    <div className="net-banner" role="alert">
      <Icon name="wifiOff" size={16} />
      {online ? 'ارتباط با سرور برقرار نیست؛ تغییرات تا برقراری اتصال ذخیره نمی‌شوند.' : 'اینترنت وصل نیست؛ تغییرات تا برقراری اتصال ذخیره نمی‌شوند.'}
    </div>
  )
}

/** Overdue (red) and near-due (orange) reminder for open tasks. */
function DueBanner() {
  const { version } = useApp()
  const tz = useTz()
  const { pathname } = useRouter()
  const open = useAsync(() => taskRepo.list({ open: 1 }), [version])
  const today = dayKey(new Date(), tz)
  const list = open.data ?? []
  const overdue = list.filter((t) => dueState(t, today) === 'overdue').length
  const soon = list.filter((t) => ['today', 'soon'].includes(dueState(t, today) ?? '')).length
  if (pathname === '/dashboard' || (!overdue && !soon)) return null
  return (
    <div className={`due-banner ${overdue ? 'overdue' : 'soon'}`} role="status">
      <Icon name="alert" size={16} />
      {overdue > 0 && <span>{overdue} کار از سررسیدش گذشته</span>}
      {overdue > 0 && soon > 0 && <span>و</span>}
      {soon > 0 && <span>{soon} کار نزدیک سررسید</span>}
      <Link href={`${routes.dashboard}#due`}>مشاهده</Link>
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useApp()
  const router = useRouter()
  const logout = async () => {
    await authRepo.logout().catch(() => {})
    router.replace(routes.login)
  }
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand">
          <Logo size={34} withText />
        </div>
        <nav className="side-nav">
          {nav.map((n) => (
            <NavLink key={n.to} href={n.to} end={n.end} className={(active) => `nav-item ${active ? 'active' : ''}`}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="avatar">{user?.name.slice(0, 1)}</div>
          <div className="side-user">
            <b>{user?.name}</b>
            <span className="ltr">{user?.email}</span>
          </div>
          <button className="icon-btn" onClick={logout} title="خروج">
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <main className="main">
        <NetBanner />
        <TimerBar />
        <DueBanner />
        {children}
      </main>
      <nav className="bottom-nav">
        {nav.slice(0, 5).map((n) => (
          <NavLink key={n.to} href={n.to} end={n.end} className={(active) => `bn-item ${active ? 'active' : ''}`}>
            <Icon name={n.icon} size={20} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </header>
  )
}
