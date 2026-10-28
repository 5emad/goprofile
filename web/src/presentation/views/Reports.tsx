import { useState } from 'react'
import { boardRepo } from '@/data/repositories'
import { fmtDay, fmtDuration, fmtTime, minuteOfDay, weekday } from '@/domain/dates'
import { taskLabel } from '@/domain/entities'
import { WEEKDAYS } from '@/domain/jalali'
import { Icon } from '../components/Icon'
import { TaskEditor } from '../components/TaskEditor'
import { Empty, Spinner } from '../components/ui'
import { useApp, useTz } from '../store'
import { useAsync } from '../viewmodels/useAsync'
import { useReportVM } from '../viewmodels/useReportVM'
import { PageHead } from './Layout'

const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:00`

export function Reports() {
  const vm = useReportVM()
  const tz = useTz()
  const { user } = useApp()
  const jira = user!.settings.jira_mode
  const boards = useAsync(() => boardRepo.list(), [])
  const [editing, setEditing] = useState<number | null>(null)
  const span = vm.window.to - vm.window.from
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => vm.window.from + i * 60)
  const maxDay = Math.max(1, ...vm.days.map((d) => d.seconds))

  return (
    <div className="page page-wide">
      <PageHead title="گزارش هفتگی" sub={`${fmtDay(vm.week, true)} تا ${fmtDay(vm.end, true)}`}>
        <div className="week-nav">
          <button className="icon-btn" onClick={vm.prev} aria-label="هفته قبل">
            <Icon name="chevronR" />
          </button>
          <button className="btn btn-sm" onClick={vm.today} disabled={vm.isCurrent}>
            این هفته
          </button>
          <button className="icon-btn" onClick={vm.next} aria-label="هفته بعد">
            <Icon name="chevronL" />
          </button>
        </div>
      </PageHead>

      {vm.loading && !vm.days.some((d) => d.logs.length) ? (
        <Spinner />
      ) : (
        <>
          <div className="week-summary">
            <div className="card stat-card">
              <div className="stat-label">جمع هفته</div>
              <div className="stat-value">{fmtDuration(vm.total, true)}</div>
            </div>
            <div className="card stat-card">
              <div className="stat-label">میانگین روزهای کاری</div>
              <div className="stat-value">{fmtDuration(vm.total / Math.max(1, vm.days.filter((d) => d.seconds).length), true)}</div>
            </div>
            <div className="card stat-card">
              <div className="stat-label">تعداد لاگ</div>
              <div className="stat-value">{vm.days.reduce((s, d) => s + d.logs.length, 0)}</div>
            </div>
            <div className="card stat-card">
              <div className="stat-label">تسک‌های درگیر</div>
              <div className="stat-value">{vm.rows.length}</div>
            </div>
          </div>

          <section className="card">
            <header className="card-head">
              <h2>خط زمانی روزها</h2>
              <span className="muted small">از اولین شروع تا آخرین پایان هر روز</span>
            </header>
            <div className="timeline">
              <div className="tl-hours">
                {hours.map((m) => (
                  <span key={m} style={{ insetInlineStart: `${((m - vm.window.from) / span) * 100}%` }}>
                    {hh(m)}
                  </span>
                ))}
              </div>
              {vm.days.map((d) => (
                <div className="tl-row" key={d.key}>
                  <div className="tl-day">
                    <b>{WEEKDAYS[weekday(d.key)]}</b>
                    <span className="muted small">{fmtDay(d.key)}</span>
                  </div>
                  <div className="tl-track">
                    {d.logs.map((l) => {
                      const s = minuteOfDay(l.started_at, tz)
                      const e = Math.min(24 * 60, s + l.seconds / 60)
                      return (
                        <button
                          key={l.id}
                          className={`tl-log ${l.ended_at ? '' : 'live'}`}
                          style={{
                            insetInlineStart: `${((s - vm.window.from) / span) * 100}%`,
                            width: `${Math.max(0.6, ((e - s) / span) * 100)}%`,
                          }}
                          title={`${taskLabel({ key: l.task_key, jira_key: l.jira_key }, jira)} ${l.task_title}\n${fmtTime(l.started_at, tz)} – ${l.ended_at ? fmtTime(l.ended_at, tz) : 'اکنون'} (${fmtDuration(l.seconds)})${l.note ? `\n${l.note}` : ''}`}
                          onClick={() => setEditing(l.task_id)}
                        />
                      )
                    })}
                  </div>
                  <div className="tl-total">
                    <b>{d.seconds ? fmtDuration(d.seconds, true) : '—'}</b>
                    {d.first && d.last && (
                      <span className="muted small ltr">
                        {fmtTime(d.first.started_at, tz)}–{d.last.ended_at ? fmtTime(d.last.ended_at, tz) : 'now'}
                      </span>
                    )}
                    <div className="tl-mini">
                      <div style={{ width: `${(d.seconds / maxDay) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <header className="card-head">
              <h2>جدول لاگ‌ها (تسک × روز)</h2>
            </header>
            {vm.rows.length ? (
              <div className="table-scroll">
                <table className="wl-table">
                  <thead>
                    <tr>
                      <th className="wl-task">تسک</th>
                      {vm.days.map((d) => (
                        <th key={d.key}>
                          {WEEKDAYS[weekday(d.key)]}
                          <small>{fmtDay(d.key)}</small>
                        </th>
                      ))}
                      <th>جمع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vm.rows.map((r) => (
                      <tr key={r.taskId} onClick={() => setEditing(r.taskId)}>
                        <td className="wl-task">
                          <span className="task-key ltr">{taskLabel({ key: r.key, jira_key: r.jiraKey }, jira)}</span>
                          <span>{r.title}</span>
                          <small className="muted">{r.board}</small>
                        </td>
                        {r.perDay.map((s, i) => (
                          <td key={i} className={s ? 'has' : ''} style={{ '--a': s ? 0.15 + (s / maxDay) * 0.6 : 0 } as React.CSSProperties}>
                            {s ? fmtDuration(s, true) : ''}
                          </td>
                        ))}
                        <td className="wl-sum">{fmtDuration(r.total, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="wl-task">جمع روز</td>
                      {vm.days.map((d) => (
                        <td key={d.key}>{d.seconds ? fmtDuration(d.seconds, true) : '—'}</td>
                      ))}
                      <td className="wl-sum">{fmtDuration(vm.total, true)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <Empty title="در این هفته لاگی ثبت نشده" />
            )}
          </section>
        </>
      )}
      {editing && <TaskEditor taskId={editing} boards={boards.data ?? []} onClose={() => setEditing(null)} />}
    </div>
  )
}
