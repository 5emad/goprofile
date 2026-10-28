// Data layer: one repository per aggregate. Views never call http directly.
import { http, session } from '@/core/http'
import type { Board, DailyStats, Meta, MetaKind, Settings, Task, TaskInput, User, Worklog } from '@/domain/entities'

interface AuthResult {
  token: string
  user: User
}

export const authRepo = {
  async login(email: string, password: string) {
    const r = await http.post<AuthResult>('/auth/login', { email, password })
    session.set(r.token)
    return r.user
  },
  async register(name: string, email: string, password: string) {
    const r = await http.post<AuthResult>('/auth/register', { name, email, password })
    session.set(r.token)
    return r.user
  },
  async logout() {
    try {
      await http.post('/auth/logout')
    } finally {
      session.set(null)
    }
  },
  me: () => http.get<User>('/me'),
  updateProfile: (name: string) => http.patch<User>('/me', { name }),
  updateSettings: (settings: Settings) => http.patch<User>('/me', { settings }),
  changePassword: (current: string, next: string) => http.post('/me/password', { current, new: next }),
  logoutOthers: () => http.post<{ removed: number }>('/me/logout-others'),
}

export const boardRepo = {
  list: () => http.get<Board[]>('/boards'),
  get: (id: number) => http.get<Board>(`/boards/${id}`),
  create: (b: { name: string; key: string; color: string }) => http.post<Board>('/boards', b),
  update: (id: number, b: Partial<Pick<Board, 'name' | 'key' | 'color' | 'position'>>) => http.patch<Board>(`/boards/${id}`, b),
  remove: (id: number) => http.del(`/boards/${id}`),
  addMeta: (id: number, kind: MetaKind, m: Partial<Meta>) => http.post<Board>(`/boards/${id}/${kind}`, m),
  updateMeta: (id: number, kind: MetaKind, item: number, m: Partial<Meta>) => http.patch<Board>(`/boards/${id}/${kind}/${item}`, m),
  removeMeta: (id: number, kind: MetaKind, item: number) => http.del<Board>(`/boards/${id}/${kind}/${item}`),
}

export const taskRepo = {
  list: (filter: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== '') q.set(k, String(v))
    return http.get<Task[]>(`/tasks${q.size ? `?${q}` : ''}`)
  },
  get: (id: number) => http.get<Task>(`/tasks/${id}`),
  create: (t: TaskInput) => http.post<Task>('/tasks', t),
  update: (id: number, t: TaskInput) => http.patch<Task>(`/tasks/${id}`, t),
  remove: (id: number) => http.del(`/tasks/${id}`),
}

export const worklogRepo = {
  range: (from: string, to: string) => http.get<Worklog[]>(`/worklogs?from=${from}&to=${to}`),
  create: (taskId: number, startedAt: Date, minutes: number, note: string) =>
    http.post<Worklog>(`/tasks/${taskId}/worklogs`, { started_at: startedAt.toISOString(), minutes, note }),
  update: (id: number, w: { started_at?: string; minutes?: number; note?: string }) => http.patch<Worklog>(`/worklogs/${id}`, w),
  remove: (id: number) => http.del(`/worklogs/${id}`),
  timer: () => http.get<Worklog | null>('/timer'),
  start: (taskId: number) => http.post<Worklog>(`/tasks/${taskId}/timer`),
  stop: (note = '') => http.post<Worklog>('/timer/stop', { note }),
}

export const statsRepo = {
  daily: (days = 371) => http.get<DailyStats>(`/stats/daily?days=${days}`),
}
