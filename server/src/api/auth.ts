import { Algorithm, hash, verify } from '@node-rs/argon2'
import { createHash, randomBytes } from 'node:crypto'
import type { Config } from '../config.js'
import type { Cluster } from '../db/cluster.js'
import { tx } from '../db/migrate.js'
import { insertBoard } from './boards.js'
import { body, field, HttpError, runes, user, type Ctx, type Router } from './http.js'

export interface Settings {
  jira_mode: boolean
  timezone: string
  daily_goal_minutes: number
  theme: 'system' | 'light' | 'dark'
}

export interface User {
  id: number
  email: string
  name: string
  settings: Settings
  created_at: Date
}

const defaultSettings = (): Settings => ({ jira_mode: false, timezone: 'Asia/Tehran', daily_goal_minutes: 360, theme: 'system' })

const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 64 * 1024, timeCost: 3, parallelism: 2, outputLen: 32 }

export const hashPassword = (pw: string) => hash(pw, ARGON)

export async function checkPassword(h: string, pw: string) {
  try {
    return await verify(h, pw)
  } catch {
    return false
  }
}

// Keeps login timing equal for unknown emails.
const dummy = hashPassword('goprofile-dummy-password')

export const hashToken = (t: string) => createHash('sha256').update(t).digest()

const validPassword = (pw: unknown): pw is string => typeof pw === 'string' && runes(pw) >= 10 && runes(pw) <= 128

export function validTimezone(tz: string) {
  if (!tz || tz === 'Local') return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function parseSettings(raw: unknown): Settings {
  return { ...defaultSettings(), ...(typeof raw === 'object' && raw ? raw : {}) } as Settings
}

const USER_COLS = 'u.id, u.email, u.name, u.settings, u.created_at'
const toUser = (r: { id: number; email: string; name: string; settings: unknown; created_at: Date }): User => ({ ...r, settings: parseSettings(r.settings) })

export function authRoutes(r: Router, db: Cluster, cfg: Config) {
  const loadUser = async (id: number) => toUser((await db.W().query(`SELECT ${USER_COLS} FROM users u WHERE u.id = $1`, [id])).rows[0])

  const issue = async (c: Ctx, uid: number) => {
    const token = randomBytes(32).toString('base64url')
    await db
      .W()
      .query('INSERT INTO sessions (token_hash, user_id, client, expires_at) VALUES ($1, $2, $3, $4)', [
        hashToken(token),
        uid,
        c.ua.slice(0, 200),
        new Date(Date.now() + cfg.sessionTtlHours * 3600_000),
      ])
    return { token, user: await loadUser(uid) }
  }

  r.add(
    'POST',
    '/auth/register',
    async (c) => {
      if (!cfg.allowSignup) throw new HttpError(403, 'ثبت‌نام غیرفعال است')
      const b = body(c, ['name', 'email', 'password'])
      const name = (field<string>(b, 'name', 'string') ?? '').trim()
      const email = (field<string>(b, 'email', 'string') ?? '').trim().toLowerCase()
      const password = field<string>(b, 'password', 'string')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new HttpError(400, 'ایمیل معتبر نیست')
      if (!name || runes(name) > 80) throw new HttpError(400, 'نام را وارد کنید')
      if (!validPassword(password)) throw new HttpError(400, 'رمز عبور باید بین ۱۰ تا ۱۲۸ کاراکتر باشد')
      const h = await hashPassword(password)
      let uid: number
      try {
        uid = await tx(db.W(), async (q) => {
          const id = (
            await q.query('INSERT INTO users (email, name, password_hash, settings) VALUES ($1, $2, $3, $4) RETURNING id', [
              email,
              name,
              h,
              JSON.stringify(defaultSettings()),
            ])
          ).rows[0].id as number
          await insertBoard(q, id, 'کارتابل من', 'GP', '#4f6a32')
          return id
        })
      } catch (err) {
        if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'این ایمیل قبلاً ثبت شده است')
        throw err
      }
      return issue(c, uid)
    },
    false,
  )

  r.add(
    'POST',
    '/auth/login',
    async (c) => {
      const b = body(c, ['email', 'password'])
      const email = (field<string>(b, 'email', 'string') ?? '').trim()
      const password = field<string>(b, 'password', 'string') ?? ''
      const row = (await db.W().query('SELECT id, password_hash FROM users WHERE lower(email) = lower($1)', [email])).rows[0]
      if (!row) {
        await checkPassword(await dummy, password)
        throw new HttpError(401, 'ایمیل یا رمز عبور اشتباه است')
      }
      if (!(await checkPassword(row.password_hash, password))) throw new HttpError(401, 'ایمیل یا رمز عبور اشتباه است')
      return issue(c, row.id)
    },
    false,
  )

  r.add('POST', '/auth/logout', async (c) => {
    await db.W().query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(c.token)])
    return { ok: true }
  })

  r.add('GET', '/me', async (c) => user(c))

  r.add('PATCH', '/me', async (c) => {
    const u = user(c)
    const b = body(c, ['name', 'settings'])
    const name = field<string>(b, 'name', 'string')
    if (name !== undefined) {
      const n = name.trim()
      if (!n || runes(n) > 80) throw new HttpError(400, 'نام معتبر نیست')
      u.name = n
    }
    if (b.settings !== undefined) {
      const s = body({ ...c, body: b.settings }, ['jira_mode', 'timezone', 'daily_goal_minutes', 'theme'])
      const next: Settings = {
        jira_mode: field<boolean>(s, 'jira_mode', 'bool') ?? false,
        timezone: field<string>(s, 'timezone', 'string') ?? '',
        daily_goal_minutes: field<number>(s, 'daily_goal_minutes', 'int') ?? 0,
        theme: (field<string>(s, 'theme', 'string') ?? '') as Settings['theme'],
      }
      if (!validTimezone(next.timezone) || !['system', 'light', 'dark'].includes(next.theme) || next.daily_goal_minutes < 0 || next.daily_goal_minutes > 1440) {
        throw new HttpError(400, 'تنظیمات معتبر نیست')
      }
      u.settings = next
    }
    await db.W().query('UPDATE users SET name = $1, settings = $2 WHERE id = $3', [u.name, JSON.stringify(u.settings), u.id])
    return u
  })

  r.add('POST', '/me/password', async (c) => {
    const u = user(c)
    const b = body(c, ['current', 'new'])
    const current = field<string>(b, 'current', 'string') ?? ''
    const next = field<string>(b, 'new', 'string')
    const row = (await db.W().query('SELECT password_hash FROM users WHERE id = $1', [u.id])).rows[0]
    if (!(await checkPassword(row.password_hash, current))) throw new HttpError(400, 'رمز فعلی اشتباه است')
    if (!validPassword(next)) throw new HttpError(400, 'رمز عبور باید بین ۱۰ تا ۱۲۸ کاراکتر باشد')
    const h = await hashPassword(next)
    await tx(db.W(), async (q) => {
      await q.query('UPDATE users SET password_hash = $1 WHERE id = $2', [h, u.id])
      // Sign out every other device.
      await q.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [u.id, hashToken(c.token)])
    })
    return { ok: true }
  })

  r.add('POST', '/me/logout-others', async (c) => {
    const res = await db.W().query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [user(c).id, hashToken(c.token)])
    return { removed: res.rowCount ?? 0 }
  })
}

/** Resolves the session token to a user or throws 401. */
export function authenticator(db: Cluster) {
  return async (c: Ctx): Promise<User> => {
    if (!c.token) throw new HttpError(401, 'ابتدا وارد شوید')
    const row = (
      await db
        .W()
        .query(`SELECT ${USER_COLS} FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = $1 AND s.expires_at > now()`, [
          hashToken(c.token),
        ])
    ).rows[0]
    if (!row) throw new HttpError(401, 'نشست منقضی شده است')
    return toUser(row)
  }
}
