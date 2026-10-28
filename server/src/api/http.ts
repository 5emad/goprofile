// Inner router and request helpers. Handlers only run after the gateway has
// decrypted the envelope.
import type { User } from './auth.js'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface Ctx {
  method: string
  path: string
  query: URLSearchParams
  params: Record<string, string>
  body: unknown
  token: string
  ip: string
  ua: string
  user?: User
}

export interface Result {
  status: number
  body: unknown
}

type Handler = (c: Ctx) => Promise<Result | unknown>

interface Route {
  method: string
  parts: string[]
  handler: Handler
  auth: boolean
}

export class Router {
  private routes: Route[] = []

  constructor(private authenticate: (c: Ctx) => Promise<User>) {}

  add(method: string, pattern: string, handler: Handler, auth = true) {
    this.routes.push({ method, parts: pattern.split('/').filter(Boolean), handler, auth })
    return this
  }

  async dispatch(c: Ctx): Promise<Result> {
    const parts = c.path.split('/').filter(Boolean)
    let pathMatched = false
    for (const r of this.routes) {
      if (r.parts.length !== parts.length) continue
      const params: Record<string, string> = {}
      const ok = r.parts.every((p, i) => {
        if (p.startsWith(':')) {
          params[p.slice(1)] = decodeURIComponent(parts[i])
          return true
        }
        return p === parts[i]
      })
      if (!ok) continue
      pathMatched = true
      if (r.method !== c.method) continue
      c.params = params
      if (r.auth) c.user = await this.authenticate(c)
      const out = await r.handler(c)
      return isResult(out) ? out : { status: 200, body: out ?? null }
    }
    throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'متد مجاز نیست' : 'پیدا نشد')
  }
}

const RESULT = Symbol('result')
const isResult = (v: unknown): v is Result => typeof v === 'object' && v !== null && RESULT in v

export const created = (body: unknown): Result => ({ status: 201, body, [RESULT]: true }) as Result

export const user = (c: Ctx) => c.user!

export function id(c: Ctx, name = 'id'): number {
  const v = Number(c.params[name])
  if (!Number.isSafeInteger(v) || v <= 0) throw new HttpError(404, 'پیدا نشد')
  return v
}

/** Validates that the body is an object holding only the allowed keys. */
export function body(c: Ctx, allowed: string[]): Record<string, unknown> {
  const b = c.body
  if (typeof b !== 'object' || b === null || Array.isArray(b)) throw new HttpError(400, 'داده نامعتبر است')
  for (const k of Object.keys(b)) if (!allowed.includes(k)) throw new HttpError(400, 'داده نامعتبر است')
  return b as Record<string, unknown>
}

type Kind = 'string' | 'int' | 'number' | 'bool'

/** Reads an optional typed field; returns undefined when absent and null when explicitly null (if allowed). */
export function field<T = unknown>(b: Record<string, unknown>, key: string, kind: Kind, nullable = false): T | undefined {
  if (!(key in b)) return undefined
  const v = b[key]
  if (v === null && nullable) return null as T
  const ok =
    (kind === 'string' && typeof v === 'string') ||
    (kind === 'int' && Number.isSafeInteger(v)) ||
    (kind === 'number' && typeof v === 'number' && Number.isFinite(v)) ||
    (kind === 'bool' && typeof v === 'boolean')
  if (!ok) throw new HttpError(400, 'داده نامعتبر است')
  return v as T
}

export const runes = (s: string) => [...s].length

export const colorRe = /^#[0-9a-fA-F]{6}$/
export const keyRe = /^[A-Z][A-Z0-9]{1,9}$/
export const dateRe = /^\d{4}-\d{2}-\d{2}$/

/** Builds UPDATE/INSERT statements; column names always come from code. */
export class Setter {
  cols: string[] = []
  exprs: string[] = []
  args: unknown[] = []

  arg(v: unknown) {
    this.args.push(v)
    return `$${this.args.length}`
  }

  add(col: string, v: unknown) {
    if (v === undefined) return
    this.cols.push(col)
    this.exprs.push(this.arg(v))
  }

  /** Adds a column whose value is an SQL expression with one %s placeholder. */
  raw(col: string, expr: string, v: unknown) {
    this.cols.push(col)
    this.exprs.push(expr.replace('%s', this.arg(v)))
  }

  expr(col: string, sql: string) {
    this.cols.push(col)
    this.exprs.push(sql)
  }

  get empty() {
    return this.cols.length === 0
  }

  update(table: string) {
    return `UPDATE ${table} SET ${this.cols.map((c, i) => `${c} = ${this.exprs[i]}`).join(', ')}`
  }

  insert(table: string) {
    return `INSERT INTO ${table} (${this.cols.join(', ')}) VALUES (${this.exprs.join(', ')})`
  }
}
