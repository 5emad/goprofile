import { useState } from 'react'
import { boardRepo, taskRepo } from '@/data/repositories'
import { fmtDayLong, fmtDuration } from '@/domain/dates'
import { taskLabel } from '@/domain/entities'
import { MONTHS } from '@/domain/jalali'
import { ActivityCard } from '../components/Activity'
import { CompareCard, DaysChart, GoalRing, MonthlyChart } from '../components/Charts'
import { TaskEditor, TimerButton } from '../components/TaskEditor'
import { Empty, Spinner } from '../components/ui'
import { useApp } from '../store'
import { useAsync } from '../viewmodels/useAsync'
import { useDashboardVM } from '../viewmodels/useDashboardVM'
import { PageHead } from './Layout'

export function Dashboard() {
  const vm = useDashboardVM()
  const { user, version } = useApp()
  const open = useAsync(() => taskRepo.list({ open: 1 }), [version])
  const boards = useAsync(() => boardRepo.list(), [version])
  const [editing, setEditing] = useState<number | null>(null)

  if (!vm.ready) return vm.error ? <div className="alert">{vm.error}</div> : <Spinner />
  const best = vm.months.reduce((a, b) => (b.seconds > a.seconds ? b : a), vm.months[0])
  const jira = user!.settings.jira_mode

  return (
    <div className="page">
      <PageHead title={`سلام ${user!.name} 👋`} sub={fmtDayLong(vm.today)} />
      <ActivityCard grid={vm.grid} summary={vm.summary} from={vm.from} today={vm.today} name={user!.name} />

      <div className="compare-row">
        <CompareCard title="زمان کار امروز" icon="clock" c={vm.time} format={(s) => fmtDuration(s, true)} />
        <CompareCard title="تسک‌های انجام‌شده" icon="check" c={vm.done} format={(n) => String(n)} />
        <CompareCard title="تسک‌های جدید" icon="plus" c={vm.created} format={(n) => String(n)} />
        {vm.goal !== null && (
          <div className="card compare">
            <GoalRing ratio={vm.goal} label={`${fmtDuration(vm.time.today, true)} از ${fmtDuration(vm.goalSeconds, true)}`} />
          </div>
        )}
      </div>

      <div className="two-col">
        <section className="card">
          <header className="card-head">
            <h2>تحلیل ماهانه</h2>
            <div className="chart-key">
              <span>
                <i className="key-bar" /> ساعت کار
              </span>
              <span>
                <i className="key-dot" /> تسک انجام‌شده
              </span>
            </div>
          </header>
          <MonthlyChart months={vm.months} />
          <p className="muted small">
            پربازده‌ترین ماه: <b>{MONTHS[best.jm - 1]}</b> با {fmtDuration(best.seconds)}
          </p>
        </section>
        <section className="card">
          <header className="card-head">
            <h2>دو هفته اخیر</h2>
            <span className="muted small">خط‌چین = هدف روزانه</span>
          </header>
          <DaysChart days={vm.last14} goalSeconds={vm.goalSeconds} />
        </section>
      </div>

      <section className="card">
        <header className="card-head">
          <h2>کارهای باز</h2>
          <span className="pill">{open.data?.length ?? 0}</span>
        </header>
        {open.data?.length ? (
          <ul className="task-rows">
            {open.data.slice(0, 8).map((t) => (
              <li key={t.id} onClick={() => setEditing(t.id)}>
                <span className="task-key ltr">{taskLabel(t, jira)}</span>
                <span className="task-title">{t.title}</span>
                <span className="muted small">{t.board_name}</span>
                <span className="muted small">{fmtDuration(t.logged_seconds, true)}</span>
                <TimerButton task={t} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="کار بازی نداری">از منوی «ایجاد تسک» شروع کن.</Empty>
        )}
      </section>
      {editing && <TaskEditor taskId={editing} boards={boards.data ?? []} onClose={() => setEditing(null)} />}
    </div>
  )
}
