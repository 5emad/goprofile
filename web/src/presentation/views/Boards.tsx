import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { boardRepo } from '@/data/repositories'
import { fmtDuration } from '@/domain/dates'
import { taskLabel, type Board, type Meta, type MetaKind, type Task } from '@/domain/entities'
import { Icon } from '../components/Icon'
import { TaskEditor, TimerButton } from '../components/TaskEditor'
import { Empty, Field, Modal, Select, Spinner } from '../components/ui'
import { useApp } from '../store'
import { useAsync } from '../viewmodels/useAsync'
import { useBoardVM } from '../viewmodels/useBoardVM'
import { PageHead } from './Layout'

const SWATCHES = ['#4f6a32', '#6f8f45', '#8aa665', '#3d5a6c', '#7a5c3a', '#8a4b4b', '#5b4a7a', '#2f3a24']

function NewBoard({ onClose }: { onClose: () => void }) {
  const { bump } = useApp()
  const navigate = useNavigate()
  const [f, setF] = useState({ name: '', key: '', color: SWATCHES[0] })
  const [err, setErr] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const b = await boardRepo.create(f)
      bump()
      navigate(`/boards/${b.id}`)
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  return (
    <Modal title="کارتابل جدید" onClose={onClose}>
      <form onSubmit={submit} className="task-form">
        <Field label="نام کارتابل">
          <input className="input" value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus />
        </Field>
        <Field label="کلید" hint="برای شماره‌گذاری تسک‌ها، مثل WEB → WEB-12">
          <input className="input ltr" value={f.key} maxLength={10} onChange={(e) => setF({ ...f, key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} required />
        </Field>
        <Field label="رنگ">
          <div className="swatches">
            {SWATCHES.map((c) => (
              <button type="button" key={c} className={`swatch ${f.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={c} />
            ))}
          </div>
        </Field>
        {err && <div className="alert">{err}</div>}
        <div className="form-actions">
          <button className="btn btn-primary">ساخت کارتابل</button>
        </div>
      </form>
    </Modal>
  )
}

export function Boards() {
  const { version } = useApp()
  const boards = useAsync(() => boardRepo.list(), [version])
  const [creating, setCreating] = useState(false)
  return (
    <div className="page">
      <PageHead title="کارتابل‌ها" sub="هر کارتابل وضعیت‌ها، فازها، Epicها و دسته‌بندی‌های خودش را دارد">
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> کارتابل جدید
        </button>
      </PageHead>
      {!boards.data ? (
        <Spinner />
      ) : (
        <div className="board-grid">
          {boards.data.map((b) => (
            <Link to={`/boards/${b.id}`} key={b.id} className="card board-card" style={{ '--accent': b.color } as React.CSSProperties}>
              <div className="board-top">
                <span className="board-key ltr">{b.key}</span>
                <span className="board-dot" />
              </div>
              <h3>{b.name}</h3>
              <div className="board-meta">
                <span>{b.open_count} باز</span>
                <span>{b.task_count - b.open_count} انجام‌شده</span>
                <span>{b.epics.length} Epic</span>
                <span>{b.phases.length} فاز</span>
              </div>
              <div className="board-bar">
                <div style={{ width: `${b.task_count ? ((b.task_count - b.open_count) / b.task_count) * 100 : 0}%` }} />
              </div>
            </Link>
          ))}
        </div>
      )}
      {creating && <NewBoard onClose={() => setCreating(false)} />}
    </div>
  )
}

function TaskCard({ t, board, jira, onOpen, onDragStart }: { t: Task; board: Board; jira: boolean; onOpen: () => void; onDragStart: (e: React.DragEvent) => void }) {
  const epic = board.epics.find((e) => e.id === t.epic_id)
  const cat = board.categories.find((c) => c.id === t.category_id)
  const phase = board.phases.find((p) => p.id === t.phase_id)
  return (
    <article className={`kcard prio-${t.priority} ${t.running ? 'is-running' : ''}`} draggable onDragStart={onDragStart} onClick={onOpen} data-id={t.id}>
      <div className="kcard-top">
        <span className="task-key ltr">{taskLabel(t, jira)}</span>
        <TimerButton task={t} />
      </div>
      <p className="kcard-title">{t.title}</p>
      <div className="chips">
        {epic && (
          <span className="chip" style={{ '--c': epic.color } as React.CSSProperties}>
            <Icon name="layers" size={11} /> {epic.name}
          </span>
        )}
        {cat && (
          <span className="chip" style={{ '--c': cat.color } as React.CSSProperties}>
            <Icon name="tag" size={11} /> {cat.name}
          </span>
        )}
        {phase && <span className="chip chip-plain">{phase.name}</span>}
      </div>
      {t.logged_seconds > 0 && (
        <div className="kcard-foot">
          <Icon name="clock" size={12} /> {fmtDuration(t.logged_seconds, true)}
          {t.estimate_minutes > 0 && <span className="muted"> / {fmtDuration(t.estimate_minutes * 60, true)}</span>}
        </div>
      )}
    </article>
  )
}

const KINDS: { kind: MetaKind; label: string; color?: boolean }[] = [
  { kind: 'statuses', label: 'وضعیت‌ها (ستون‌ها)' },
  { kind: 'phases', label: 'فازها' },
  { kind: 'epics', label: 'Epicها', color: true },
  { kind: 'categories', label: 'دسته‌بندی‌ها', color: true },
]

function MetaEditor({ board, onChange }: { board: Board; onChange: (b: Board) => void }) {
  const { toast } = useApp()
  const [names, setNames] = useState<Record<string, string>>({})
  const run = async (p: Promise<Board>) => {
    try {
      onChange(await p)
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }
  return (
    <div className="meta-grid">
      {KINDS.map(({ kind, label, color }) => {
        const list = board[kind] as Meta[]
        return (
          <section className="card" key={kind}>
            <h3>{label}</h3>
            <ul className="meta-list">
              {list.map((m) => (
                <li key={m.id}>
                  {color && (
                    <input
                      type="color"
                      value={m.color}
                      onChange={(e) => run(boardRepo.updateMeta(board.id, kind, m.id, { color: e.target.value }))}
                      aria-label="رنگ"
                    />
                  )}
                  <input
                    className="input input-flat"
                    defaultValue={m.name}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && run(boardRepo.updateMeta(board.id, kind, m.id, { name: e.target.value }))}
                  />
                  {kind === 'statuses' && (
                    <label className="check" title="تسک‌های این ستون انجام‌شده حساب شوند">
                      <input type="checkbox" checked={!!m.is_done} onChange={(e) => run(boardRepo.updateMeta(board.id, kind, m.id, { is_done: e.target.checked }))} />
                      انجام‌شده
                    </label>
                  )}
                  <button
                    className="icon-btn danger"
                    onClick={() => confirm(`«${m.name}» حذف شود؟`) && run(boardRepo.removeMeta(board.id, kind, m.id))}
                    aria-label="حذف"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="meta-add"
              onSubmit={(e) => {
                e.preventDefault()
                const name = (names[kind] ?? '').trim()
                if (!name) return
                run(boardRepo.addMeta(board.id, kind, { name })).then(() => setNames({ ...names, [kind]: '' }))
              }}
            >
              <input className="input" placeholder="افزودن…" value={names[kind] ?? ''} onChange={(e) => setNames({ ...names, [kind]: e.target.value })} />
              <button className="btn btn-sm">
                <Icon name="plus" size={14} />
              </button>
            </form>
          </section>
        )
      })}
    </div>
  )
}

export function BoardView() {
  const id = Number(useParams().id)
  const vm = useBoardVM(id)
  const { user, bump, toast } = useApp()
  const navigate = useNavigate()
  const boards = useAsync(() => boardRepo.list(), [])
  const [tab, setTab] = useState<'kanban' | 'settings'>('kanban')
  const [editing, setEditing] = useState<number | null>(null)
  const [dragging, setDragging] = useState<Task | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const board = vm.board.data
  const jira = user!.settings.jira_mode

  if (vm.board.error) return <div className="alert">{vm.board.error}</div>
  if (!board) return <Spinner />

  const dropIn = (statusId: number, e: React.DragEvent) => {
    e.preventDefault()
    setOver(null)
    if (!dragging) return
    const target = (e.target as HTMLElement).closest('.kcard') as HTMLElement | null
    const before = target ? Number(target.dataset.id) : null
    if (before !== dragging.id) vm.move(dragging, statusId, before)
    setDragging(null)
  }

  return (
    <div className="page page-wide">
      <PageHead title={board.name} sub={`${vm.total} تسک · کلید ${board.key}`}>
        <div className="tabs">
          <button className={tab === 'kanban' ? 'on' : ''} onClick={() => setTab('kanban')}>
            کارتابل
          </button>
          <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>
            دسته‌بندی‌ها و تنظیمات
          </button>
        </div>
        <button className="btn btn-primary" onClick={() => navigate(`/tasks/new?board=${board.id}`)}>
          <Icon name="plus" size={16} /> تسک
        </button>
      </PageHead>

      {tab === 'kanban' ? (
        <>
          <div className="filters">
            <div className="search">
              <Icon name="search" size={16} />
              <input className="input" placeholder="جستجو در عنوان یا شماره…" value={vm.filter.q} onChange={(e) => vm.setFilter({ ...vm.filter, q: e.target.value })} />
            </div>
            <Select value={vm.filter.phase} options={board.phases.map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => vm.setFilter({ ...vm.filter, phase: v ?? '' })} empty="همه فازها" />
            <Select value={vm.filter.epic} options={board.epics.map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => vm.setFilter({ ...vm.filter, epic: v ?? '' })} empty="همه Epicها" />
            <Select
              value={vm.filter.category}
              options={board.categories.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(v) => vm.setFilter({ ...vm.filter, category: v ?? '' })}
              empty="همه دسته‌ها"
            />
          </div>
          <div className="kanban">
            {vm.columns.map(({ status, tasks }) => (
              <section
                key={status.id}
                className={`kcol ${over === status.id ? 'over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(status.id)
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => dropIn(status.id, e)}
              >
                <header className="kcol-head">
                  <span>
                    {status.is_done && <Icon name="check" size={14} />} {status.name}
                  </span>
                  <span className="pill">{tasks.length}</span>
                </header>
                <div className="kcol-body">
                  {tasks.map((t) => (
                    <TaskCard key={t.id} t={t} board={board} jira={jira} onOpen={() => setEditing(t.id)} onDragStart={() => setDragging(t)} />
                  ))}
                  {!tasks.length && <div className="kcol-empty">تسکی اینجا نیست</div>}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <>
          <MetaEditor board={board} onChange={(b) => (vm.board.setData(b), bump())} />
          <section className="card danger-zone">
            <div>
              <h3>حذف کارتابل</h3>
              <p className="muted">همه تسک‌ها و لاگ‌های این کارتابل برای همیشه حذف می‌شوند.</p>
            </div>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (prompt(`برای تأیید، کلید کارتابل (${board.key}) را بنویسید`) !== board.key) return
                try {
                  await boardRepo.remove(board.id)
                  bump()
                  navigate('/boards')
                } catch (e) {
                  toast((e as Error).message, 'err')
                }
              }}
            >
              حذف کارتابل
            </button>
          </section>
        </>
      )}
      {!vm.tasks.loading && !vm.tasks.data?.length && tab === 'kanban' && <Empty title="این کارتابل هنوز خالی است" />}
      {editing && <TaskEditor taskId={editing} boards={boards.data ?? [board]} onClose={() => setEditing(null)} />}
    </div>
  )
}
