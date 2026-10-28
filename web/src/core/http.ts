import { secureCall } from './secure'

const TOKEN_KEY = 'gp.token'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

let token: string | null = null
try {
  token = localStorage.getItem(TOKEN_KEY)
} catch {
  token = null
}

const listeners = new Set<() => void>()

export const session = {
  get token() {
    return token
  },
  set(t: string | null) {
    token = t
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* storage unavailable: keep the session in memory only */
    }
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await secureCall(method, path, token, body)
  if (res.status === 401 && token) session.set(null)
  if (res.status >= 400) {
    const msg = (res.body as { error?: string } | null)?.error ?? 'خطای ناشناخته'
    throw new ApiError(res.status, msg)
  }
  return res.body as T
}

export const http = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  patch: <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
}
