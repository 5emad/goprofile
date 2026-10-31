import { useMemo, useState } from 'react'
import { boardRepo, taskRepo } from '@/data/repositories'
import { dayKey, fmtDayLong, fmtDuration } from '@/domain/dates'
import { taskLabel, type Board, type Task } from '@/domain/entities'
import { MONTHS } from '@/domain/jalali'
import { dueState, inRange, rangeOf, SOON_DAYS } from '@/domain/report'
import { ActivityCard } from '../components/Activity'
import { CompareCard, DaysChart, GoalRing, MonthlyChart } from '../components/Charts'
import { TaskEditor, TimerButton } from '../components/TaskEditor'
import { DueBadge, Empty, Spinner } from '../components/ui'
import { useApp, useTz } from '../store'
import { useAsync } from '../viewmodels/useAsync'
import { useDashboardVM } from '../viewmodels/useDashboardVM'
import { PageHead } from './Layout'

export function Dashboard() {
  const vm = useDashboardVM()
  const { user, version } = useApp()
  const tasks = useAsync(() => taskRepo.list(), [version])
  const boards = useAsync(() => boardRepo.list(), [version])
  const [editing, setEditing] = useState<number | null>(null)
  const tz = useTz()
  const today = dayKey(new Date(), tz)
  const open = useMemo(
    () => (tasks.data ?? []).filter((t) => !t.done_at).sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || b.priority - a.priority),
    [tasks.data],
  )
  const overdue = open.filter((t) => dueState(t, today) === 'overdue')
  const soon = open.filter((t) => ['today', 'soon'].includes(dueState(t, today) ?? ''))

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

      {(overdue.length > 0 || soon.length > 0) && (
        <section className="card" id="due">
          <header className="card-head">
            <h2>هشدار سررسید</h2>
            <span className="muted small">قرمز: گذشته · نارنجی: امروز تا {SOON_DAYS} روز آینده</span>
          </header>
          <ul className="task-rows">
            {[...overdue, ...soon].map((t) => (
              <li key={t.id} onClick={() => setEditing(t.id)} className={`row-${dueState(t, today)}`}>
                <span className="task-key ltr">{taskLabel(t, jira)}</span>
                <span className="task-title">{t.title}</span>
                <span className="muted small">{t.board_name}</span>
                <DueBadge task={t} today={today} />
                <TimerButton task={t} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <StatusOverview tasks={tasks.data ?? []} boards={boards.data ?? []} today={today} tz={tz} overdue={overdue.length} soon={soon.length} />

      <section className="card">
        <header className="card-head">
          <h2>کارهای باز</h2>
          <span className="pill">{open.length}</span>
        </header>
        {open.length ? (
          <ul className="task-rows">
            {open.slice(0, 10).map((t) => (
              <li key={t.id} onClick={() => setEditing(t.id)} className={dueState(t, today) ? `row-${dueState(t, today)}` : ''}>
                <span className="task-key ltr">{taskLabel(t, jira)}</span>
                <span className="task-title">
                  {t.title} <DueBadge task={t} today={today} />
                </span>
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

const STATUS_COLORS = ['#c3cdb0', '#e2b15b', '#6f9fb0', '#a98bc4', '#d98b6a', '#8fb3a0']

/** Task counts per status for every board, with overall totals. */
function StatusOverview({ tasks, boards, today, tz, overdue, soon }: { tasks: Task[]; boards: Board[]; today: string; tz: string; overdue: number; soon: number }) {
  const week = rangeOf('week', today)
  const doneWeek = tasks.filter((t) => t.done_at && inRange(dayKey(new Date(t.done_at), tz), week)).length
  const open = tasks.filter((t) => !t.done_at).length
  return (
    <section className="card">
      <header className="card-head">
        <h2>وضعیت کارها</h2>
        <span className="muted small">
          {tasks.length} تسک در {boards.length} کارتابل
        </span>
      </header>
      <div className="status-totals">
        <div className="status-total">
          <b>{open}</b>کار باز
        </div>
        <div className="status-total danger">
          <b>{overdue}</b>سررسید گذشته
        </div>
        <div className="status-total warn">
          <b>{soon}</b>نزدیک سررسید
        </div>
        <div className="status-total ok">
          <b>{doneWeek}</b>انجام‌شده این هفته
        </div>
      </div>
      <div className="status-board">
        {boards
          .filter((b) => b.task_count > 0)
          .map((b) => {
            const mine = tasks.filter((t) => t.board_id === b.id)
            let n = 0
            const parts = b.statuses.map((s) => ({
              s,
              count: mine.filter((t) => t.status_id === s.id).length,
              color: s.is_done ? 'var(--l4)' : STATUS_COLORS[n++ % STATUS_COLORS.length],
            }))
            const late = mine.filter((t) => dueState(t, today) === 'overdue').length
            return (
              <div key={b.id}>
                <div className="status-row-head">
                  <b>{b.name}</b>
                  {late > 0 && <span className="due due-overdue">{late} گذشته</span>}
                  <span className="muted small">
                    {b.open_count} باز از {b.task_count}
                  </span>
                </div>
                <div className="stack">
                  {parts
                    .filter((p) => p.count)
                    .map((p) => (
                      <i key={p.s.id} style={{ width: `${(p.count / Math.max(1, mine.length)) * 100}%`, background: p.color }} title={`${p.s.name}: ${p.count}`} />
                    ))}
                </div>
                <div className="stack-key">
                  {parts.map((p) => (
                    <span key={p.s.id}>
                      <i style={{ background: p.color }} />
                      {p.s.name} <b>{p.count}</b>
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        {!boards.some((b) => b.task_count > 0) && <p className="muted small">هنوز تسکی ثبت نشده.</p>}
      </div>
    </section>
  )
}
