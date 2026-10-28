// Outer HTTP server: only the key endpoint, the encrypted gateway and a health check.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { authenticator, authRoutes } from './api/auth.js'
import { boardRoutes } from './api/boards.js'
import { HttpError, Router, type Ctx } from './api/http.js'
import { taskRoutes } from './api/tasks.js'
import { worklogRoutes } from './api/worklogs.js'
import type { Config } from './config.js'
import type { Cluster } from './db/cluster.js'
import { log } from './log.js'
import { ALG, EnvelopeError, ReplayGuard, type Keys, type Session } from './secure/envelope.js'

/** Fixed-window counter per key. */
class Limiter {
  private hits = new Map<string, { count: number; reset: number }>()
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  allow(key: string) {
    const now = Date.now()
    if (this.hits.size > 100_000) for (const [k, b] of this.hits) if (now > b.reset) this.hits.delete(k)
    let b = this.hits.get(key)
    if (!b || now > b.reset) this.hits.set(key, (b = { count: 0, reset: now + this.windowMs }))
    return ++b.count <= this.max
  }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cache-Control': 'no-store',
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new EnvelopeError('too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function buildServer(cfg: Config, db: Cluster, keys: Keys) {
  const router = new Router(authenticator(db))
  authRoutes(router, db, cfg)
  boardRoutes(router, db)
  taskRoutes(router, db)
  worklogRoutes(router, db)

  const replay = new ReplayGuard(120_000)
  const authRL = new Limiter(10, 60_000)
  const apiRL = new Limiter(600, 60_000)

  const clientIp = (req: IncomingMessage) => {
    const real = req.headers['x-real-ip']
    return cfg.trustProxy && typeof real === 'string' ? real : (req.socket.remoteAddress ?? '')
  }

  const reply = (res: ServerResponse, s: Session, status: number, body: unknown) =>
    send(res, 200, s.seal(Buffer.from(JSON.stringify({ s: status, b: body ?? null }))))

  async function gateway(req: IncomingMessage, res: ServerResponse) {
    const ip = clientIp(req)
    if (!apiRL.allow(ip)) return send(res, 429, { error: 'rate' })
    let env
    try {
      env = JSON.parse((await readBody(req, 2 << 20)).toString('utf8'))
    } catch {
      return send(res, 400, { error: 'envelope' })
    }
    if (env?.kid !== keys.kid) return send(res, 409, { error: 'rekey' })
    let plain: Buffer, session: Session
    try {
      ;[plain, session] = keys.open(env)
    } catch {
      return send(res, 400, { error: 'envelope' })
    }
    let inner: { m?: unknown; p?: unknown; t?: unknown; ts?: unknown; id?: unknown; b?: unknown }
    try {
      inner = JSON.parse(plain.toString('utf8'))
    } catch {
      return send(res, 400, { error: 'envelope' })
    }
    if (typeof inner.m !== 'string' || typeof inner.p !== 'string' || !inner.p.startsWith('/') || inner.p.startsWith('//')) {
      return send(res, 400, { error: 'envelope' })
    }
    if (!replay.accept(inner.id, inner.ts)) return send(res, 400, { error: 'stale' })
    if (inner.p.startsWith('/auth/') && !authRL.allow(ip)) {
      return reply(res, session, 429, { error: 'تعداد تلاش‌ها زیاد است، کمی بعد دوباره امتحان کنید' })
    }

    const url = new URL(inner.p, 'http://inner')
    const ctx: Ctx = {
      method: inner.m.toUpperCase(),
      path: url.pathname,
      query: url.searchParams,
      params: {},
      body: inner.b ?? null,
      token: typeof inner.t === 'string' ? inner.t : '',
      ip,
      ua: req.headers['user-agent'] ?? '',
    }
    try {
      const out = await router.dispatch(ctx)
      reply(res, session, out.status, out.body)
    } catch (err) {
      if (err instanceof HttpError) return reply(res, session, err.status, { error: err.message })
      log.error('request failed', { method: ctx.method, path: ctx.path, err: err as Error })
      reply(res, session, 500, { error: 'خطای داخلی سرور' })
    }
  }

  return createServer({ requestTimeout: 15_000, headersTimeout: 5_000, maxHeaderSize: 16 << 10 }, async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v)
    const origin = req.headers.origin
    if (origin && cfg.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Max-Age', '600')
      res.setHeader('Vary', 'Origin')
    }
    const path = (req.url ?? '').split('?')[0]
    try {
      if (req.method === 'OPTIONS' && path.startsWith('/api/')) {
        res.writeHead(204).end()
      } else if (req.method === 'GET' && path === '/healthz') {
        await db.W().query({ text: 'SELECT 1', query_timeout: 2000 } as never)
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok')
      } else if (req.method === 'GET' && path === '/api/key') {
        send(res, 200, { kid: keys.kid, pub: keys.publicKey, alg: ALG, now: Date.now() })
      } else if (req.method === 'POST' && path === '/api/x') {
        await gateway(req, res)
      } else {
        send(res, 404, { error: 'not found' })
      }
    } catch (err) {
      log.error('request failed', { path, err: err as Error })
      if (!res.headersSent) send(res, path === '/healthz' ? 503 : 500, { error: 'internal' })
    }
  })
}
