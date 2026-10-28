import { useState, type FormEvent } from 'react'
import { taskRepo, worklogRepo } from '@/data/repositories'
import { dayKey, fmtDayLong, fmtDuration, fmtTime, zonedToDate } from '@/domain/dates'
import { taskLabel, type Board, type Task } from '@/domain/entities'
import { useApp, useElapsed, useTz } from '../store'
import { useAsync } from '../viewmodels/useAsync'
import { Icon } from './Icon'
import { TaskForm, type TaskFormValue, toInput } from './TaskForm'
import { Field, JalaliDateInput, Modal, Spinner } from './ui'

function useTaskEditorVM(taskId: number) {
  const app = useApp()
  const task = useAsync(() => taskRepo.get(taskId), [taskId, app.version])
  const save = async (v: TaskFormValue) => {
    await taskRepo.update(taskId, toInput(v))
    app.toast('تسک ذخیره شد')
    app.bump()
  }
  const remove = async () => {
    await taskRepo.remove(taskId)
    app.toast('تسک حذف شد')
    app.bump()
  }
  const addLog = async (day: string, time: string, minutes: number, note: string) => {
    await worklogRepo.create(taskId, zonedToDate(day, time, app.user!.settings.timezone), minutes, note)
    app.toast('زمان ثبت شد')
    app.bump()
  }
  const removeLog = async (id: number) => {
    await worklogRepo.remove(id)
    app.bump()
  }
  return { task, save, remove, addLog, removeLog }
}

export function TimerButton({ task }: { task: Pick<Task, 'id' | 'running'> }) {
  const { timer, startTimer, stopTimer, toast } = useApp()
  const running = timer?.task_id === task.id
  const elapsed = useElapsed(running ? timer?.started_at : null)
  const click = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      if (running) await stopTimer()
      else await startTimer(task.id)
    } catch (err) {
      toast((err as Error).message, 'err')
    }
  }
  return (
    <button className={`timer-btn ${running ? 'running' : ''}`} onClick={click} title={running ? 'توقف تایمر و ثبت لاگ' : 'شروع تایمر'}>
      <Icon name={running ? 'stop' : 'play'} size={12} />
      {running && <span className="ltr">{fmtDuration(elapsed, true)}</span>}
    </button>
  )
}

function ManualLog({ onAdd }: { onAdd: (day: string, time: string, minutes: number, note: string) => Promise<void> }) {
  const tz = useTz()
  const [day, setDay] = useState(dayKey(new Date(), tz))
  const [time, setTime] = useState('09:00')
  const [h, setH] = useState(1)
  const [m, setM] = useState(0)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const minutes = h * 60 + m
    if (minutes < 1) return setErr('مدت زمان را وارد کنید')
    try {
      await onAdd(day, time, minutes, note)
      setNote('')
      setErr('')
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  return (
    <form className="manual-log" onSubmit={submit}>
      <div className="form-grid four">
        <Field label="تاریخ">
          <JalaliDateInput tz={tz} value={day} onChange={setDay} />
        </Field>
        <Field label="ساعت شروع">
          <input className="input ltr" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </Field>
        <Field label="ساعت">
          <input className="input" type="number" min={0} max={24} value={h} onChange={(e) => setH(Number(e.target.value) || 0)} />
        </Field>
        <Field label="دقیقه">
          <input className="input" type="number" min={0} max={59} value={m} onChange={(e) => setM(Number(e.target.value) || 0)} />
        </Field>
      </div>
      <div className="manual-row">
        <input className="input" placeholder="توضیح کاری که انجام شد (اختیاری)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        <button className="btn">ثبت لاگ</button>
      </div>
      {err && <div className="alert">{err}</div>}
    </form>
  )
}

export function TaskEditor({ taskId, boards, onClose }: { taskId: number; boards: Board[]; onClose: () => void }) {
  const vm = useTaskEditorVM(taskId)
  const { user, toast } = useApp()
  const tz = useTz()
  const [tab, setTab] = useState<'details' | 'logs'>('details')
  const t = vm.task.data
  return (
    <Modal title={t ? `${taskLabel(t, user!.settings.jira_mode)} · ${t.title}` : 'تسک'} onClose={onClose} wide>
      {!t ? (
        vm.task.error ? <div className="alert">{vm.task.error}</div> : <Spinner />
      ) : (
        <>
          <div className="editor-bar">
            <div className="tabs">
              <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>
                جزئیات
              </button>
              <button className={tab === 'logs' ? 'on' : ''} onClick={() => setTab('logs')}>
                لاگ زمان <span className="pill">{fmtDuration(t.logged_seconds, true)}</span>
              </button>
            </div>
            <div className="editor-actions">
              <TimerButton task={t} />
              <button
                className="icon-btn danger"
                title="حذف تسک"
                onClick={async () => {
                  if (!confirm('این تسک و همه لاگ‌هایش حذف شود؟')) return
                  try {
                    await vm.remove()
                    onClose()
                  } catch (e) {
                    toast((e as Error).message, 'err')
                  }
                }}
              >
                <Icon name="trash" />
              </button>
            </div>
          </div>
          {tab === 'details' ? (
            <TaskForm
              key={t.updated_at}
              boards={boards}
              lockBoard
              submitLabel="ذخیره تغییرات"
              onSubmit={vm.save}
              value={{
                board_id: t.board_id,
                jira_key: t.jira_key,
                title: t.title,
                description: t.description,
                status_id: t.status_id,
                phase_id: t.phase_id,
                epic_id: t.epic_id,
                category_id: t.category_id,
                priority: t.priority,
                estimate_minutes: t.estimate_minutes,
                due_on: t.due_on ?? '',
              }}
            />
          ) : (
            <div className="logs">
              <ManualLog onAdd={vm.addLog} />
              {t.estimate_minutes > 0 && (
                <div className="progress">
                  <div style={{ width: `${Math.min(100, (t.logged_seconds / 60 / t.estimate_minutes) * 100)}%` }} />
                  <span>
                    {fmtDuration(t.logged_seconds)} از {fmtDuration(t.estimate_minutes * 60)}
                  </span>
                </div>
              )}
              <ul className="log-list">
                {(t.worklogs ?? [])
                  .slice()
                  .reverse()
                  .map((l) => (
                    <li key={l.id} className={l.ended_at ? '' : 'live'}>
                      <span className="log-src">
                        <Icon name={l.source === 'timer' ? 'clock' : 'edit'} size={14} />
                      </span>
                      <div className="log-main">
                        <b>{l.ended_at ? fmtDuration(l.seconds) : 'در حال اجرا…'}</b>
                        <span className="muted">
                          {fmtDayLong(dayKey(new Date(l.started_at), tz))} · <span className="ltr">{fmtTime(l.started_at, tz)}</span>
                          {l.ended_at && (
                            <>
                              {' تا '}
                              <span className="ltr">{fmtTime(l.ended_at, tz)}</span>
                            </>
                          )}
                        </span>
                        {l.note && <span className="log-note">{l.note}</span>}
                      </div>
                      {l.ended_at && (
                        <button className="icon-btn danger" title="حذف لاگ" onClick={() => vm.removeLog(l.id).catch((e) => toast(e.message, 'err'))}>
                          <Icon name="trash" size={16} />
                        </button>
                      )}
                    </li>
                  ))}
                {!t.worklogs?.length && <li className="muted">هنوز لاگی ثبت نشده است.</li>}
              </ul>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
