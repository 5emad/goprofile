import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { authRepo } from '@/data/repositories'
import { fmtClock } from '@/domain/dates'
import { taskLabel } from '@/domain/entities'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { useApp, useElapsed } from '../store'

const nav = [
  { to: '/', icon: 'dashboard', label: 'داشبورد', end: true },
  { to: '/boards', icon: 'board', label: 'کارتابل‌ها' },
  { to: '/tasks/new', icon: 'plus', label: 'ایجاد تسک' },
  { to: '/reports', icon: 'report', label: 'گزارش هفتگی' },
  { to: '/settings', icon: 'settings', label: 'تنظیمات' },
  { to: '/profile', icon: 'user', label: 'پروفایل' },
]

function TimerBar() {
  const { timer, stopTimer, toast, user } = useApp()
  const elapsed = useElapsed(timer?.started_at)
  if (!timer) return null
  return (
    <div className="timer-bar">
      <span className="pulse" />
      <span className="timer-task">
        <b>{taskLabel({ key: timer.task_key, jira_key: timer.jira_key }, user!.settings.jira_mode)}</b> {timer.task_title}
      </span>
      <span className="timer-clock ltr">{fmtClock(elapsed)}</span>
      <button className="btn btn-sm btn-primary" onClick={() => stopTimer().then(() => toast('لاگ ثبت شد')).catch((e) => toast(e.message, 'err'))}>
        <Icon name="stop" size={12} /> توقف و ثبت
      </button>
    </div>
  )
}

export function Layout() {
  const { user } = useApp()
  const navigate = useNavigate()
  const logout = async () => {
    await authRepo.logout().catch(() => {})
    navigate('/login')
  }
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand">
          <Logo size={34} withText />
        </div>
        <nav className="side-nav">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
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
        <TimerBar />
        <Outlet />
      </main>
      <nav className="bottom-nav">
        {nav.slice(0, 5).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `bn-item ${isActive ? 'active' : ''}`}>
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
