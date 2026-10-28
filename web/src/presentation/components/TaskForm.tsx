import { useState, type FormEvent } from 'react'
import { PRIORITIES, type Board, type TaskInput } from '@/domain/entities'
import { useApp, useTz } from '../store'
import { Field, JalaliDateInput, Select } from './ui'

export interface TaskFormValue {
  board_id: number | null
  jira_key: string
  title: string
  description: string
  status_id: number | null
  phase_id: number | null
  epic_id: number | null
  category_id: number | null
  priority: number
  estimate_minutes: number
  due_on: string
}

export function emptyTask(boardId: number | null): TaskFormValue {
  return {
    board_id: boardId,
    jira_key: '',
    title: '',
    description: '',
    status_id: null,
    phase_id: null,
    epic_id: null,
    category_id: null,
    priority: 2,
    estimate_minutes: 0,
    due_on: '',
  }
}

export function toInput(v: TaskFormValue): TaskInput {
  return { ...v, board_id: v.board_id ?? undefined, due_on: v.due_on || null }
}

export function TaskForm({
  boards,
  value,
  onSubmit,
  submitLabel,
  lockBoard,
}: {
  boards: Board[]
  value: TaskFormValue
  onSubmit: (v: TaskFormValue) => Promise<void>
  submitLabel: string
  lockBoard?: boolean
}) {
  const { user } = useApp()
  const tz = useTz()
  const jira = user?.settings.jira_mode ?? false
  const [v, setV] = useState(value)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const board = boards.find((b) => b.id === v.board_id)
  const set = <K extends keyof TaskFormValue>(k: K, val: TaskFormValue[K]) => setV((p) => ({ ...p, [k]: val }))
  const opts = (list: { id: number; name: string }[] = []) => list.map((m) => ({ value: m.id, label: m.name }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!v.board_id || !v.title.trim()) return setErr('کارتابل و عنوان را وارد کنید')
    setBusy(true)
    setErr('')
    try {
      await onSubmit(v)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="task-form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="کارتابل">
          <Select
            value={v.board_id}
            options={boards.map((b) => ({ value: b.id, label: `${b.name} (${b.key})` }))}
            onChange={(id) => setV((p) => ({ ...p, board_id: id, status_id: null, phase_id: null, epic_id: null, category_id: null }))}
            empty={lockBoard ? undefined : 'انتخاب کنید'}
          />
        </Field>
        {jira && (
          <Field label="شماره تسک جیرا" hint="مثلاً PROJ-123">
            <input className="input ltr" value={v.jira_key} maxLength={40} onChange={(e) => set('jira_key', e.target.value)} placeholder="PROJ-123" />
          </Field>
        )}
      </div>
      <Field label="عنوان تسک">
        <input className="input" value={v.title} maxLength={300} onChange={(e) => set('title', e.target.value)} autoFocus required />
      </Field>
      <Field label="توضیحات">
        <textarea className="input" rows={5} value={v.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <div className="form-grid">
        <Field label="وضعیت">
          <Select value={v.status_id} options={opts(board?.statuses)} onChange={(x) => set('status_id', x)} empty="پیش‌فرض" />
        </Field>
        <Field label="فاز">
          <Select value={v.phase_id} options={opts(board?.phases)} onChange={(x) => set('phase_id', x)} empty="بدون فاز" />
        </Field>
        <Field label="Epic">
          <Select value={v.epic_id} options={opts(board?.epics)} onChange={(x) => set('epic_id', x)} empty="بدون Epic" />
        </Field>
        <Field label="دسته‌بندی">
          <Select value={v.category_id} options={opts(board?.categories)} onChange={(x) => set('category_id', x)} empty="بدون دسته" />
        </Field>
        <Field label="اولویت">
          <Select value={v.priority} options={PRIORITIES} onChange={(x) => set('priority', x ?? 2)} />
        </Field>
        <Field label="تخمین (دقیقه)">
          <input className="input" type="number" min={0} max={100000} value={v.estimate_minutes} onChange={(e) => set('estimate_minutes', Number(e.target.value) || 0)} />
        </Field>
        <Field label="موعد">
          <JalaliDateInput tz={tz} value={v.due_on} onChange={(x) => set('due_on', x)} allowEmpty />
        </Field>
      </div>
      {err && <div className="alert">{err}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'در حال ذخیره…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
