import { useNavigate, useSearchParams } from 'react-router-dom'
import { boardRepo, taskRepo } from '@/data/repositories'
import { TaskForm, emptyTask, toInput, type TaskFormValue } from '../components/TaskForm'
import { Empty, Spinner } from '../components/ui'
import { useApp } from '../store'
import { useAsync } from '../viewmodels/useAsync'
import { PageHead } from './Layout'

export function NewTask() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { bump, toast, startTimer, user } = useApp()
  const boards = useAsync(() => boardRepo.list(), [])
  const pre = Number(params.get('board')) || null

  const create = (andStart: boolean) => async (v: TaskFormValue) => {
    const t = await taskRepo.create(toInput(v))
    if (andStart) await startTimer(t.id)
    toast(`تسک ${t.key} ساخته شد`)
    bump()
    navigate(`/boards/${t.board_id}`)
  }

  if (!boards.data) return <Spinner />
  if (!boards.data.length) return <Empty title="اول یک کارتابل بساز" />
  const first = pre ?? boards.data[0].id
  return (
    <div className="page page-narrow">
      <PageHead title="ایجاد تسک" sub={user!.settings.jira_mode ? 'حالت جیرا فعال است: شماره تسک جیرا را هم وارد کن' : undefined} />
      <section className="card">
        <TaskForm boards={boards.data} value={emptyTask(first)} onSubmit={create(false)} submitLabel="ساخت تسک" />
      </section>
    </div>
  )
}
