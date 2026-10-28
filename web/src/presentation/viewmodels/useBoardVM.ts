import { useCallback, useMemo, useState } from 'react'
import { boardRepo, taskRepo } from '@/data/repositories'
import type { Task } from '@/domain/entities'
import { useApp } from '../store'
import { useAsync } from './useAsync'

export interface BoardFilter {
  q: string
  phase: number | ''
  epic: number | ''
  category: number | ''
}

export function useBoardVM(boardId: number) {
  const { version, toast, bump } = useApp()
  const board = useAsync(() => boardRepo.get(boardId), [boardId, version])
  const tasks = useAsync(() => taskRepo.list({ board_id: boardId }), [boardId, version])
  const [filter, setFilter] = useState<BoardFilter>({ q: '', phase: '', epic: '', category: '' })

  const visible = useMemo(() => {
    const q = filter.q.trim().toLowerCase()
    return (tasks.data ?? []).filter(
      (t) =>
        (!q || t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q) || t.jira_key.toLowerCase().includes(q)) &&
        (filter.phase === '' || t.phase_id === filter.phase) &&
        (filter.epic === '' || t.epic_id === filter.epic) &&
        (filter.category === '' || t.category_id === filter.category),
    )
  }, [tasks.data, filter])

  const columns = useMemo(
    () =>
      (board.data?.statuses ?? []).map((s) => ({
        status: s,
        tasks: visible.filter((t) => t.status_id === s.id).sort((a, b) => a.position - b.position),
      })),
    [board.data, visible],
  )

  /** Moves a task into a column before `beforeId` (or to the end). */
  const move = useCallback(
    async (task: Task, statusId: number, beforeId: number | null) => {
      const col = (tasks.data ?? []).filter((t) => t.status_id === statusId && t.id !== task.id).sort((a, b) => a.position - b.position)
      const idx = beforeId === null ? col.length : col.findIndex((t) => t.id === beforeId)
      const prev = col[idx - 1]?.position
      const next = col[idx]?.position
      const position = prev === undefined && next === undefined ? 1 : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2
      // Optimistic update keeps drag and drop snappy.
      tasks.setData((tasks.data ?? []).map((t) => (t.id === task.id ? { ...t, status_id: statusId, position } : t)))
      try {
        await taskRepo.update(task.id, { status_id: statusId, position })
        bump()
      } catch (e) {
        toast((e as Error).message, 'err')
        tasks.reload()
      }
    },
    [tasks, toast, bump],
  )

  return { board, tasks, columns, filter, setFilter, move, total: visible.length }
}
