import type pg from 'pg'
import type { Cluster } from '../db/cluster.js'
import { tx } from '../db/migrate.js'
import { body, colorRe, dateRe, field, HttpError, id, keyRe, runes, Setter, user, type Ctx, type Router } from './http.js'

type Q = Pick<pg.Pool, 'query'>

const defaultStatuses: [string, boolean][] = [
  ['برای انجام', false],
  ['در حال انجام', false],
  ['بازبینی', false],
  ['انجام شد', true],
]

export async function insertBoard(q: Q, uid: number, name: string, key: string, color: string) {
  const bid = (
    await q.query(
      `INSERT INTO boards (user_id, name, key, color, position)
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(max(position), 0) + 1 FROM boards WHERE user_id = $1)) RETURNING id`,
      [uid, name, key, color],
    )
  ).rows[0].id as number
  for (const [i, [n, done]] of defaultStatuses.entries()) {
    await q.query('INSERT INTO statuses (board_id, name, position, is_done) VALUES ($1, $2, $3, $4)', [bid, n, i, done])
  }
  return bid
}

export async function ownsBoard(db: Cluster, uid: number, bid: number) {
  return (await db.W().query('SELECT 1 FROM boards WHERE id = $1 AND user_id = $2', [bid, uid])).rowCount === 1
}

// Lookup tables per board and the columns each accepts.
const META: Record<string, string[]> = {
  statuses: ['name', 'position', 'is_done'],
  phases: ['name', 'position', 'starts_on', 'ends_on'],
  epics: ['name', 'position', 'color'],
  categories: ['name', 'position', 'color'],
}

async function fillMeta(db: Cluster, b: Record<string, unknown>) {
  const q = async (sql: string) => (await db.W().query(sql, [b.id])).rows
  b.statuses = await q('SELECT id, name, position, is_done FROM statuses WHERE board_id = $1 ORDER BY position, id')
  b.phases = await q('SELECT id, name, position, starts_on, ends_on FROM phases WHERE board_id = $1 ORDER BY position, id')
  b.epics = await q('SELECT id, name, position, color FROM epics WHERE board_id = $1 ORDER BY position, id')
  b.categories = await q('SELECT id, name, position, color FROM categories WHERE board_id = $1 ORDER BY position, id')
  return b
}

function boardInput(c: Ctx) {
  const b = body(c, ['name', 'key', 'color', 'position'])
  let name = field<string>(b, 'name', 'string')
  let key = field<string>(b, 'key', 'string')
  const color = field<string>(b, 'color', 'string')
  const position = field<number>(b, 'position', 'int')
  if (name !== undefined) {
    name = name.trim()
    if (!name || runes(name) > 60) throw new HttpError(400, 'نام کارتابل معتبر نیست')
  }
  if (key !== undefined) {
    key = key.trim().toUpperCase()
    if (!keyRe.test(key)) throw new HttpError(400, 'کلید باید ۲ تا ۱۰ حرف لاتین بزرگ یا عدد باشد و با حرف شروع شود')
  }
  if (color !== undefined && !colorRe.test(color)) throw new HttpError(400, 'رنگ معتبر نیست')
  return { name, key, color, position }
}

export function boardRoutes(r: Router, db: Cluster) {
  const getBoard = async (c: Ctx, bid = id(c)) => {
    const row = (await db.W().query('SELECT id, name, key, color, position, created_at FROM boards WHERE id = $1 AND user_id = $2', [bid, user(c).id])).rows[0]
    if (!row) throw new HttpError(404, 'کارتابل پیدا نشد')
    return fillMeta(db, row)
  }

  const metaReq = async (c: Ctx) => {
    const kind = c.params.kind
    const bid = id(c)
    if (!META[kind]) throw new HttpError(404, 'پیدا نشد')
    if (!(await ownsBoard(db, user(c).id, bid))) throw new HttpError(404, 'کارتابل پیدا نشد')
    return { kind, cols: META[kind], bid }
  }

  const metaSetter = (c: Ctx, cols: string[]) => {
    const b = body(c, ['name', 'position', 'color', 'is_done', 'starts_on', 'ends_on'])
    const s = new Setter()
    let name = field<string>(b, 'name', 'string')
    if (name !== undefined) {
      name = name.trim()
      if (!name || runes(name) > 60) throw new HttpError(400, 'نام معتبر نیست')
    }
    const color = field<string>(b, 'color', 'string')
    if (color !== undefined && !colorRe.test(color)) throw new HttpError(400, 'رنگ معتبر نیست')
    const isDone = field<boolean>(b, 'is_done', 'bool')
    const starts = field<string>(b, 'starts_on', 'string', true)
    const ends = field<string>(b, 'ends_on', 'string', true)
    for (const d of [starts, ends]) if (d && !dateRe.test(d)) throw new HttpError(400, 'تاریخ معتبر نیست')
    const add = (col: string, v: unknown) => cols.includes(col) && s.add(col, v)
    add('name', name)
    add('position', field<number>(b, 'position', 'int'))
    add('color', color)
    add('is_done', isDone)
    if (starts !== undefined && cols.includes('starts_on')) s.raw('starts_on', "NULLIF(%s, '')::date", starts ?? '')
    if (ends !== undefined && cols.includes('ends_on')) s.raw('ends_on', "NULLIF(%s, '')::date", ends ?? '')
    return { s, name, isDone }
  }

  r.add('GET', '/boards', async (c) => {
    const rows = (
      await db.W().query(
        `SELECT b.id, b.name, b.key, b.color, b.position, b.created_at,
           count(t.id)::int AS task_count, (count(t.id) FILTER (WHERE t.done_at IS NULL))::int AS open_count
         FROM boards b LEFT JOIN tasks t ON t.board_id = b.id
         WHERE b.user_id = $1 GROUP BY b.id ORDER BY b.position, b.id`,
        [user(c).id],
      )
    ).rows
    return Promise.all(rows.map((b) => fillMeta(db, b)))
  })

  r.add('GET', '/boards/:id', (c) => getBoard(c))

  r.add('POST', '/boards', async (c) => {
    const inp = boardInput(c)
    if (inp.name === undefined || inp.key === undefined) throw new HttpError(400, 'نام و کلید کارتابل لازم است')
    const bid = await tx(db.W(), (q) => insertBoard(q, user(c).id, inp.name!, inp.key!, inp.color ?? '#4f6a32'))
    return getBoard(c, bid)
  })

  r.add('PATCH', '/boards/:id', async (c) => {
    const bid = id(c)
    const inp = boardInput(c)
    const s = new Setter()
    s.add('name', inp.name)
    s.add('key', inp.key)
    s.add('color', inp.color)
    s.add('position', inp.position)
    if (!s.empty) {
      const res = await db.W().query(`${s.update('boards')} WHERE id = ${s.arg(bid)} AND user_id = ${s.arg(user(c).id)}`, s.args)
      if (!res.rowCount) throw new HttpError(404, 'کارتابل پیدا نشد')
    }
    return getBoard(c)
  })

  r.add('DELETE', '/boards/:id', async (c) => {
    const res = await db.W().query('DELETE FROM boards WHERE id = $1 AND user_id = $2', [id(c), user(c).id])
    if (!res.rowCount) throw new HttpError(404, 'کارتابل پیدا نشد')
    return { ok: true }
  })

  r.add('POST', '/boards/:id/:kind', async (c) => {
    const { kind, cols, bid } = await metaReq(c)
    const { s, name } = metaSetter(c, cols)
    if (name === undefined) throw new HttpError(400, 'نام لازم است')
    if (!s.cols.includes('position')) s.raw('position', `(SELECT COALESCE(max(position), -1) + 1 FROM ${kind} WHERE board_id = %s)`, bid)
    s.add('board_id', bid)
    await db.W().query(s.insert(kind), s.args)
    return getBoard(c)
  })

  r.add('PATCH', '/boards/:id/:kind/:item', async (c) => {
    const { kind, cols, bid } = await metaReq(c)
    const item = id(c, 'item')
    const { s, isDone } = metaSetter(c, cols)
    if (!s.empty) await db.W().query(`${s.update(kind)} WHERE id = ${s.arg(item)} AND board_id = ${s.arg(bid)}`, s.args)
    if (kind === 'statuses' && isDone !== undefined) {
      // Keep done_at in step with the status' done flag.
      await db
        .W()
        .query('UPDATE tasks SET done_at = CASE WHEN $1 THEN COALESCE(done_at, now()) ELSE NULL END WHERE status_id = $2 AND board_id = $3', [isDone, item, bid])
    }
    return getBoard(c)
  })

  r.add('DELETE', '/boards/:id/:kind/:item', async (c) => {
    const { kind, bid } = await metaReq(c)
    await db.W().query(`DELETE FROM ${kind} WHERE id = $1 AND board_id = $2`, [id(c, 'item'), bid])
    return getBoard(c)
  })
}
