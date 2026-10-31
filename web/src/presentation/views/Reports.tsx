import { useState, type CSSProperties } from 'react'
import { dayKey, fmtDay, fmtDayLong, fmtDuration, fmtTime, hoursLabel, minuteOfDay, weekday } from '@/domain/dates'
import { PRIORITIES, taskLabel, type Meta, type Task } from '@/domain/entities'
import { WEEKDAYS } from '@/domain/jalali'
import { delta, dueLabel, dueState, PERIODS, type DayLogs, type PeriodReport } from '@/domain/report'
import { Icon } from '../components/Icon'
import { TaskEditor } from '../components/TaskEditor'
import { Empty, Spinner } from '../components/ui'
import { useApp, useTz } from '../store'
import { useReportVM } from '../viewmodels/useReportVM'
import { PageHead } from './Layout'

const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:00`
const pct = (part: number, all: number) => (all ? Math.round((part / all) * 100) : 0)

const CURRENT: Record<string, string> = { day: 'امروز', week: 'این هفته', month: 'این ماه', year: 'امسال' }

function Kpi({ label, value, sub, d, prevName }: { label: string; value: string; sub?: string; d?: number | null; prevName?: string }) {
  return (
    <div className="card kpi">
      <div className="stat-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {d !== undefined && d !== null ? (
        <div className={`compare-delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`}>
          <Icon name={d >= 0 ? 'up' : 'down'} size={12} />
          {Math.abs(d)}٪ <span className="muted">نسبت به {prevName}</span>
        </div>
      ) : (
        sub && <div className="muted small">{sub}</div>
      )}
    </div>
  )
}

function BarChart({ r, goal, onPick }: { r: PeriodReport; goal: number; onPick?: (key: string) => void }) {
  const daily = r.range.period === 'week' || r.range.period === 'month'
  const max = Math.max(1, ...r.buckets.map((b) => b.seconds), daily ? goal : 0)
  return (
    <div className={`bars bars-${r.range.period}`}>
      <div className="bars-plot">
        {daily && goal > 0 && (
          <div className="bars-goal" style={{ bottom: `${(goal / max) * 100}%` }}>
            <span>هدف {hoursLabel(goal)} ساعت</span>
          </div>
        )}
        {r.buckets.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`bar ${daily && goal && b.seconds >= goal ? 'hit' : ''}`}
            title={`${b.sub ?? b.label}: ${fmtDuration(b.seconds)}`}
            onClick={daily && onPick ? () => onPick(b.key) : undefined}
            disabled={!daily}
          >
            <span className="bar-fill" style={{ height: `${(b.seconds / max) * 100}%` }}>
              {b.seconds > 0 && <span className="bar-val">{hoursLabel(b.seconds)}</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="bars-labels">
        {r.buckets.map((b) => (
          <span key={b.key}>{b.label}</span>
        ))}
      </div>
    </div>
  )
}

function Timeline({ r, onPick, onTask }: { r: PeriodReport; onPick: (k: string) => void; onTask: (id: number) => void }) {
  const tz = useTz()
  const { user } = useApp()
  const jira = user!.settings.jira_mode
  const { from, to } = r.window
  const span = to - from
  const step = span > 12 * 60 ? 120 : 60
  const hours = Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => from + i * step)
  const maxDay = Math.max(1, ...r.days.map((d) => d.seconds))
  const rows = r.range.period === 'month' ? r.days.filter((d) => d.seconds > 0) : r.days
  if (!rows.length) return <Empty title="در این بازه لاگی ثبت نشده" />
  return (
    <div className="timeline">
      <div className="tl-hours">
        {hours.map((m) => (
          <span key={m} style={{ insetInlineStart: `${((m - from) / span) * 100}%` }}>
            {hh(m)}
          </span>
        ))}
      </div>
      {rows.map((d: DayLogs) => (
        <div className="tl-row" key={d.key}>
          <button type="button" className="tl-day" onClick={() => onPick(d.key)} disabled={r.range.period === 'day'}>
            <b>{WEEKDAYS[weekday(d.key)]}</b>
            <span className="muted small">{fmtDay(d.key)}</span>
          </button>
          <div className="tl-track" style={{ '--steps': span / 60 } as CSSProperties}>
            {d.logs.map((l) => {
              const s = minuteOfDay(l.started_at, tz)
              const e = Math.min(24 * 60, s + l.seconds / 60)
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`tl-log ${l.ended_at ? '' : 'live'} ${l.source === 'manual' ? 'manual' : ''}`}
                  style={{ insetInlineStart: `${((s - from) / span) * 100}%`, width: `${Math.max(0.6, ((e - s) / span) * 100)}%` }}
                  title={`${taskLabel({ key: l.task_key, jira_key: l.jira_key }, jira)} ${l.task_title}\n${fmtTime(l.started_at, tz)} – ${l.ended_at ? fmtTime(l.ended_at, tz) : 'اکنون'} (${fmtDuration(l.seconds)})${l.note ? `\n${l.note}` : ''}`}
                  onClick={() => onTask(l.task_id)}
                />
              )
            })}
          </div>
          <div className="tl-total">
            <b>{d.seconds ? fmtDuration(d.seconds, true) : '—'}</b>
            {d.first && d.last && (
              <span className="muted small ltr">
                {fmtTime(d.first, tz)}–{fmtTime(d.last, tz)}
              </span>
            )}
            <div className="tl-mini">
              <div style={{ width: `${(d.seconds / maxDay) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
      <div className="tl-key muted small">
        <span>
          <i className="tl-swatch" /> تایمر
        </span>
        <span>
          <i className="tl-swatch manual" /> دستی
        </span>
        <span>
          <i className="tl-swatch live" /> در حال اجرا
        </span>
      </div>
    </div>
  )
}

function ShareBars({ items, total }: { items: { label: string; seconds: number; sub?: string }[]; total: number }) {
  if (!items.length) return <p className="muted small">داده‌ای نیست.</p>
  return (
    <ul className="shares">
      {items.map((it) => (
        <li key={it.label}>
          <div className="share-head">
            <span className="share-label">{it.label}</span>
            {it.sub && <span className="muted small">{it.sub}</span>}
            <b>{fmtDuration(it.seconds, true)}</b>
            <span className="muted small share-pct">{pct(it.seconds, total)}٪</span>
          </div>
          <div className="share-track">
            <div style={{ width: `${pct(it.seconds, total)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function TaskTable({ title, tone, tasks, statuses, today, onOpen, empty, doneCol }: {
  title: string
  tone: 'danger' | 'warn' | 'ok' | 'plain'
  tasks: Task[]
  statuses: Map<number, Meta>
  today: string
  onOpen: (id: number) => void
  empty: string
  doneCol?: boolean
}) {
  const tz = useTz()
  const { user } = useApp()
  const jira = user!.settings.jira_mode
  return (
    <section className={`card task-group tone-${tone}`}>
      <header className="card-head">
        <h2>{title}</h2>
        <span className="pill">{tasks.length}</span>
      </header>
      {tasks.length ? (
        <div className="table-scroll">
          <table className="rp-table">
            <thead>
              <tr>
                <th>کلید</th>
                <th className="rp-title">عنوان</th>
                <th>کارتابل</th>
                <th>وضعیت</th>
                <th>اولویت</th>
                <th>{doneCol ? 'تاریخ انجام' : 'سررسید'}</th>
                <th>زمان ثبت‌شده</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const s = dueState(t, today)
                return (
                  <tr key={t.id} onClick={() => onOpen(t.id)} className={s ? `row-${s}` : ''}>
                    <td>
                      <span className="task-key ltr">{taskLabel(t, jira)}</span>
                    </td>
                    <td className="rp-title">{t.title}</td>
                    <td className="muted">{t.board_name}</td>
                    <td>{(t.status_id && statuses.get(t.status_id)?.name) || '—'}</td>
                    <td>{PRIORITIES[t.priority]?.label}</td>
                    <td>
                      {doneCol ? (
                        t.done_at && fmtDay(dayKey(new Date(t.done_at), tz), true)
                      ) : t.due_on ? (
                        <span className={`due-text due-${s}`}>
                          {fmtDay(t.due_on, true)}
                          {s && s !== 'later' && <small> ({dueLabel(t, today)})</small>}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{fmtDuration(t.logged_seconds, true)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">{empty}</p>
      )}
    </section>
  )
}

export function Reports() {
  const vm = useReportVM()
  const tz = useTz()
  const { user } = useApp()
  const jira = user!.settings.jira_mode
  const [editing, setEditing] = useState<number | null>(null)
  const r = vm.report
  const p = vm.prevReport
  const periodLabel = PERIODS.find((x) => x.value === vm.period)!.label
  const others = vm.groups.open.filter((t) => !['overdue', 'today', 'soon'].includes(dueState(t, vm.today) ?? ''))

  const print = () => {
    const prev = document.title
    document.title = `گزارش کارکرد ${periodLabel} - ${vm.range.label}`
    window.print()
    document.title = prev
  }

  return (
    <div className="page page-wide report">
      <PageHead title={`گزارش کارکرد ${periodLabel}`} sub={vm.range.label}>
        <div className="seg seg-text" role="tablist">
          {PERIODS.map((x) => (
            <button key={x.value} className={vm.period === x.value ? 'on' : ''} onClick={() => vm.setPeriod(x.value)} role="tab" aria-selected={vm.period === x.value}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="week-nav">
          <button className="icon-btn" onClick={vm.prev} aria-label="بازه قبل">
            <Icon name="chevronR" />
          </button>
          <button className="btn btn-sm" onClick={vm.goToday} disabled={vm.isCurrent}>
            {CURRENT[vm.period]}
          </button>
          <button className="icon-btn" onClick={vm.next} aria-label="بازه بعد">
            <Icon name="chevronL" />
          </button>
        </div>
        <button className="btn btn-primary btn-sm" onClick={print} disabled={!r}>
          <Icon name="print" size={15} /> خروجی PDF / چاپ
        </button>
      </PageHead>

      <div className="print-head">
        <div>
          <b className="print-brand">goprofile</b>
          <h1>گزارش کارکرد {periodLabel}</h1>
          <p>
            {vm.range.label} (از {fmtDay(vm.range.from, true)} تا {fmtDay(vm.range.to, true)})
          </p>
        </div>
        <div className="print-meta">
          <b>{user!.name}</b>
          <span className="ltr">{user!.email}</span>
          <span>تهیه‌شده در {fmtDayLong(vm.today)} ساعت {fmtTime(new Date(), tz)}</span>
        </div>
      </div>

      {vm.error && <div className="alert">{vm.error}</div>}
      {!r ? (
        <Spinner />
      ) : (
        <>
          <div className="kpis">
            <Kpi label="کل زمان کار" value={fmtDuration(r.total, true)} d={p ? delta(r.total, p.total) : null} prevName={vm.prevName} sub="بدون داده برای مقایسه" />
            {vm.period !== 'day' && <Kpi label="روزهای کاری" value={`${r.workDays} از ${r.elapsedDays}`} sub={r.elapsedDays < r.days.length ? `روز سپری‌شده از ${r.days.length} روز` : `${pct(r.workDays, r.days.length)}٪ روزها`} />}
            {vm.period !== 'day' && (
              <Kpi
                label="میانگین روز کاری"
                value={fmtDuration(r.avgPerWorkDay, true)}
                d={p && p.workDays ? delta(r.avgPerWorkDay, p.avgPerWorkDay) : null}
                prevName={vm.prevName}
                sub={vm.goal ? `هدف ${fmtDuration(vm.goal, true)}` : undefined}
              />
            )}
            {vm.period === 'day' && <Kpi label="شروع و پایان" value={r.days[0].first ? `${fmtTime(r.days[0].first, tz)}–${fmtTime(r.days[0].last!, tz)}` : '—'} />}
            {vm.period === 'day' && <Kpi label="تحقق هدف روزانه" value={`${pct(r.total, vm.goal)}٪`} sub={`از ${fmtDuration(vm.goal, true)}`} />}
            <Kpi label="تعداد لاگ" value={String(r.logs)} sub={`${r.tasks.length} تسک درگیر`} />
            <Kpi label="تسک‌های انجام‌شده" value={String(vm.groups.done.length)} sub={`${vm.groups.created.length} تسک جدید`} />
            <Kpi label="هشدار سررسید" value={String(vm.groups.overdue.length)} sub={`سررسید گذشته، ${vm.groups.soon.length} نزدیک سررسید`} />
          </div>

          <section className="card insights">
            <header className="card-head">
              <h2>تحلیل و جمع‌بندی</h2>
            </header>
            <ul>
              {vm.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>

          <section className="card">
            <header className="card-head">
              <h2>{vm.period === 'day' ? 'کارکرد ساعت به ساعت' : vm.period === 'year' ? 'کارکرد ماه به ماه' : 'کارکرد روز به روز'}</h2>
              <span className="muted small">اعداد به ساعت{vm.period === 'week' || vm.period === 'month' ? ' · برای گزارش روز روی ستون بزنید' : ''}</span>
            </header>
            <BarChart r={r} goal={vm.goal} onPick={vm.openDay} />
          </section>

          {vm.period !== 'year' && (
            <section className="card">
              <header className="card-head">
                <h2>خط زمانی</h2>
                <span className="muted small">از اولین شروع تا آخرین پایان{vm.period === 'month' ? ' · فقط روزهای کاری' : ''}</span>
              </header>
              <Timeline r={r} onPick={vm.openDay} onTask={setEditing} />
            </section>
          )}

          <div className="two-col even">
            <section className="card">
              <header className="card-head">
                <h2>توزیع بر اساس کارتابل</h2>
              </header>
              <ShareBars items={r.boards.map((b) => ({ label: b.name, seconds: b.seconds }))} total={r.total} />
            </section>
            <section className="card">
              <header className="card-head">
                <h2>الگوی کاری</h2>
              </header>
              <ShareBars
                items={[
                  { label: 'ثبت با تایمر', seconds: r.timerSeconds },
                  { label: 'ثبت دستی', seconds: r.manualSeconds },
                ]}
                total={r.total}
              />
              {vm.period !== 'day' && (
                <>
                  <h3 className="sub-title">روزهای هفته</h3>
                  <ShareBars items={r.weekdays.map((s, i) => ({ label: WEEKDAYS[i], seconds: s })).filter((x) => x.seconds)} total={r.total} />
                </>
              )}
            </section>
          </div>

          <section className="card">
            <header className="card-head">
              <h2>کارکرد به تفکیک تسک</h2>
              <span className="pill">{r.tasks.length}</span>
            </header>
            {!r.tasks.length ? (
              <Empty title="در این بازه لاگی ثبت نشده" />
            ) : vm.period === 'week' ? (
              <div className="table-scroll">
                <table className="wl-table">
                  <thead>
                    <tr>
                      <th className="wl-task">تسک</th>
                      {r.days.map((d) => (
                        <th key={d.key}>
                          {WEEKDAYS[weekday(d.key)]}
                          <small>{fmtDay(d.key)}</small>
                        </th>
                      ))}
                      <th>جمع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.tasks.map((t) => {
                      const maxDay = Math.max(1, ...r.days.map((d) => d.seconds))
                      return (
                        <tr key={t.taskId} onClick={() => setEditing(t.taskId)}>
                          <td className="wl-task">
                            <span className="task-key ltr">{taskLabel({ key: t.key, jira_key: t.jiraKey }, jira)}</span>
                            <span>{t.title}</span>
                          </td>
                          {r.days.map((d) => {
                            const s = d.logs.filter((l) => l.task_id === t.taskId).reduce((a, l) => a + l.seconds, 0)
                            return (
                              <td key={d.key} className={s ? 'has' : ''} style={{ '--a': s ? 0.15 + (s / maxDay) * 0.6 : 0 } as CSSProperties}>
                                {s ? fmtDuration(s, true) : ''}
                              </td>
                            )
                          })}
                          <td className="wl-sum">{fmtDuration(t.seconds, true)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="wl-task">جمع روز</td>
                      {r.days.map((d) => (
                        <td key={d.key}>{d.seconds ? fmtDuration(d.seconds, true) : '—'}</td>
                      ))}
                      <td className="wl-sum">{fmtDuration(r.total, true)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="rp-table">
                  <thead>
                    <tr>
                      <th>کلید</th>
                      <th className="rp-title">عنوان</th>
                      <th>کارتابل</th>
                      <th>تعداد لاگ</th>
                      <th>زمان</th>
                      <th className="rp-share">سهم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.tasks.map((t) => (
                      <tr key={t.taskId} onClick={() => setEditing(t.taskId)}>
                        <td>
                          <span className="task-key ltr">{taskLabel({ key: t.key, jira_key: t.jiraKey }, jira)}</span>
                        </td>
                        <td className="rp-title">{t.title}</td>
                        <td className="muted">{t.board}</td>
                        <td>{t.logs}</td>
                        <td>
                          <b>{fmtDuration(t.seconds, true)}</b>
                        </td>
                        <td className="rp-share">
                          <div className="share-track">
                            <div style={{ width: `${pct(t.seconds, r.total)}%` }} />
                          </div>
                          <small>{pct(t.seconds, r.total)}٪</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>جمع</td>
                      <td>{r.logs}</td>
                      <td>{fmtDuration(r.total, true)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <TaskTable title="سررسید گذشته" tone="danger" tasks={vm.groups.overdue} statuses={vm.statuses} today={vm.today} onOpen={setEditing} empty="کاری از سررسیدش عقب نیست." />
          <TaskTable title="نزدیک به سررسید" tone="warn" tasks={vm.groups.soon} statuses={vm.statuses} today={vm.today} onOpen={setEditing} empty="کاری در روزهای آینده سررسید نمی‌شود." />
          <TaskTable title="انجام‌شده در این بازه" tone="ok" tasks={vm.groups.done} statuses={vm.statuses} today={vm.today} onOpen={setEditing} empty="در این بازه تسکی انجام نشده." doneCol />
          <TaskTable title="سایر کارهای باقی‌مانده" tone="plain" tasks={others} statuses={vm.statuses} today={vm.today} onOpen={setEditing} empty="کار باز دیگری نداری." />

          {vm.period !== 'year' && r.logs > 0 && (
            <section className="card">
              <header className="card-head">
                <h2>ریز لاگ‌ها</h2>
                <span className="pill">{r.logs}</span>
              </header>
              <div className="table-scroll">
                <table className="rp-table">
                  <thead>
                    <tr>
                      {vm.period !== 'day' && <th>تاریخ</th>}
                      <th>شروع</th>
                      <th>پایان</th>
                      <th>مدت</th>
                      <th>تسک</th>
                      <th>نوع</th>
                      <th className="rp-title">توضیح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.days.flatMap((d) =>
                      d.logs.map((l) => (
                        <tr key={l.id} onClick={() => setEditing(l.task_id)}>
                          {vm.period !== 'day' && <td>{fmtDayLong(d.key)}</td>}
                          <td className="ltr">{fmtTime(l.started_at, tz)}</td>
                          <td className="ltr">{l.ended_at ? fmtTime(l.ended_at, tz) : 'اکنون'}</td>
                          <td>
                            <b>{fmtDuration(l.seconds, true)}</b>
                          </td>
                          <td>
                            <span className="task-key ltr">{taskLabel({ key: l.task_key, jira_key: l.jira_key }, jira)}</span> {l.task_title}
                          </td>
                          <td>{l.source === 'timer' ? 'تایمر' : 'دستی'}</td>
                          <td className="rp-title muted">{l.note || '—'}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <p className="print-foot">گزارش خودکار goprofile · {vm.range.label}</p>
        </>
      )}
      {editing && <TaskEditor taskId={editing} boards={vm.boards} onClose={() => setEditing(null)} />}
    </div>
  )
}

