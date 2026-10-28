export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  jira_mode: boolean
  timezone: string
  daily_goal_minutes: number
  theme: Theme
}

export interface User {
  id: number
  email: string
  name: string
  settings: Settings
  created_at: string
}

export interface Meta {
  id: number
  name: string
  position: number
  color?: string
  is_done?: boolean
  starts_on?: string | null
  ends_on?: string | null
}

export type MetaKind = 'statuses' | 'phases' | 'epics' | 'categories'

export interface Board {
  id: number
  name: string
  key: string
  color: string
  position: number
  created_at: string
  task_count: number
  open_count: number
  statuses: Meta[]
  phases: Meta[]
  epics: Meta[]
  categories: Meta[]
}

export interface Worklog {
  id: number
  task_id: number
  task_key: string
  jira_key: string
  task_title: string
  board_id: number
  board_name: string
  started_at: string
  ended_at: string | null
  seconds: number
  note: string
  source: 'manual' | 'timer'
}

export interface Task {
  id: number
  board_id: number
  board_name: string
  key: string
  number: number
  jira_key: string
  title: string
  description: string
  status_id: number | null
  phase_id: number | null
  epic_id: number | null
  category_id: number | null
  priority: number
  estimate_minutes: number
  due_on: string | null
  position: number
  created_at: string
  updated_at: string
  done_at: string | null
  logged_seconds: number
  running: boolean
  worklogs?: Worklog[]
}

export type TaskInput = Partial<
  Pick<Task, 'board_id' | 'jira_key' | 'title' | 'description' | 'status_id' | 'phase_id' | 'epic_id' | 'category_id' | 'priority' | 'estimate_minutes' | 'due_on' | 'position'>
>

export interface DayStat {
  d: string
  created: number
  done: number
  logs: number
  seconds: number
}

export interface DailyStats {
  from: string
  today: string
  days: DayStat[]
}

export const PRIORITIES = [
  { value: 0, label: 'خیلی کم' },
  { value: 1, label: 'کم' },
  { value: 2, label: 'متوسط' },
  { value: 3, label: 'زیاد' },
  { value: 4, label: 'فوری' },
]

/** The display key: the Jira key in Jira mode when set, otherwise the board key. */
export function taskLabel(t: Pick<Task, 'key' | 'jira_key'>, jira: boolean) {
  return jira && t.jira_key ? t.jira_key : t.key
}
