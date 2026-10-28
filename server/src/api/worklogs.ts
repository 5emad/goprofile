import type pg from 'pg'
import type { Cluster } from '../db/cluster.js'
import { tx } from '../db/migrate.js'
import { body, created, dateRe, field, HttpError, id, runes, user, type Ctx, type Router } from './http.js'

export async function queryWorklogs(p: Pick<pg.Pool, 'query'>, where: string, args: unknown[]) {
  return (
    await p.query(
      `SELECT w.id, w.task_id, b.key || '-' || t.number AS task_key, t.jira_key, t.title AS task_title, b.id AS board_id, b.name AS board_name,
         w.started_at, w.ended_at, extract(epoch FROM COALESCE(w.ended_at, now()) - w.started_at)::bigint AS seconds, w.note, w.source
       FROM worklogs w JOIN tasks t ON t.id = w.task_id JOIN boards b ON b.id = t.board_id
       WHERE ${where} ORDER BY w.started_at`,
      args,
    )
  ).rows
}

function worklogInput(c: Ctx) {
  const b = body(c, ['started_at', 'minutes', 'note'])
  const raw = field<string>(b, 'started_at', 'string')
  const minutes = field<number>(b, 'minutes', 'int')
  let note = field<string>(b, 'note', 'string')
  let start: Date | undefined
  if (raw !== undefined) {
    start = new Date(raw)
    if (Number.isNaN(start.getTime())) throw new HttpError(400, 'داده نامعتبر است')
    start.setMilliseconds(0)
    if (start.getTime() > Date.now() + 86_400_000) throw new HttpError(400, 'زمان شروع نمی‌تواند در آینده باشد')
  }
  if (minutes !== undefined && (minutes < 1 || minutes > 1440)) throw new HttpError(400, 'مدت زمان باید بین ۱ دقیقه تا ۲۴ ساعت باشد')
  if (note !== undefined) {
    note = note.trim()
    if (runes(note) > 1000) throw new HttpError(400, 'توضیح لاگ خیلی طولانی است')
  }
  return { start, minutes, note }
}

export function worklogRoutes(r: Router, db: Cluster) {
  const one = async (uid: number, wid: number) => {
    const l = (await queryWorklogs(db.W(), 'w.id = $1 AND w.user_id = $2', [wid, uid]))[0]
    if (!l) throw new HttpError(404, 'لاگ پیدا نشد')
    return l
  }

  // Logs starting between the from and to dates (inclusive) in the user's timezone; served by a replica.
  r.add('GET', '/worklogs', async (c) => {
    const u = user(c)
    const from = c.query.get('from') ?? ''
    const to = c.query.get('to') ?? ''
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
    if (!dateRe.test(from) || !dateRe.test(to) || !(days >= 0 && days <= 93)) throw new HttpError(400, 'بازه تاریخ معتبر نیست')
    return queryWorklogs(
      db.R(),
      `w.user_id = $1 AND w.started_at >= ($2::date)::timestamp AT TIME ZONE $4 AND w.started_at < ($3::date + 1)::timestamp AT TIME ZONE $4`,
      [u.id, from, to, u.settings.timezone],
    )
  })

  r.add('POST', '/tasks/:id/worklogs', async (c) => {
    const uid = user(c).id
    const inp = worklogInput(c)
    if (!inp.start || inp.minutes === undefined) throw new HttpError(400, 'زمان شروع و مدت لازم است')
    const row = (
      await db.W().query(
        `INSERT INTO worklogs (task_id, user_id, started_at, ended_at, note, source)
         SELECT id, user_id, $3, $4, $5, 'manual' FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id`,
        [id(c), uid, inp.start, new Date(inp.start.getTime() + inp.minutes * 60_000), inp.note ?? ''],
      )
    ).rows[0]
    if (!row) throw new HttpError(404, 'تسک پیدا نشد')
    return created(await one(uid, row.id))
  })

  r.add('PATCH', '/worklogs/:id', async (c) => {
    const uid = user(c).id
    const wid = id(c)
    const inp = worklogInput(c)
    const cur = await one(uid, wid)
    if (!cur.ended_at && (inp.start || inp.minutes !== undefined)) throw new HttpError(400, 'ابتدا تایمر را متوقف کنید')
    const start: Date = inp.start ?? cur.started_at
    const end = cur.ended_at ? new Date(start.getTime() + (inp.minutes !== undefined ? inp.minutes * 60 : cur.seconds) * 1000) : null
    await db.W().query('UPDATE worklogs SET started_at = $1, ended_at = $2, note = $3 WHERE id = $4 AND user_id = $5', [start, end, inp.note ?? cur.note, wid, uid])
    return one(uid, wid)
  })

  r.add('DELETE', '/worklogs/:id', async (c) => {
    const res = await db.W().query('DELETE FROM worklogs WHERE id = $1 AND user_id = $2', [id(c), user(c).id])
    if (!res.rowCount) throw new HttpError(404, 'لاگ پیدا نشد')
    return { ok: true }
  })

  r.add('GET', '/timer', async (c) => (await queryWorklogs(db.W(), 'w.user_id = $1 AND w.ended_at IS NULL', [user(c).id]))[0] ?? null)

  // Stops any running timer and opens a new timer worklog on the task.
  r.add('POST', '/tasks/:id/timer', async (c) => {
    const uid = user(c).id
    const tid = id(c)
    const wid = await tx(db.W(), async (q) => {
      await q.query('UPDATE worklogs SET ended_at = now() WHERE user_id = $1 AND ended_at IS NULL', [uid])
      const row = (
        await q.query(
          `INSERT INTO worklogs (task_id, user_id, started_at, source)
           SELECT id, user_id, date_trunc('second', now()), 'timer' FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id`,
          [tid, uid],
        )
      ).rows[0]
      if (!row) throw new HttpError(404, 'تسک پیدا نشد')
      return row.id as number
    })
    return created(await one(uid, wid))
  })

  r.add('POST', '/timer/stop', async (c) => {
    const uid = user(c).id
    const note = (field<string>(body(c, ['note']), 'note', 'string') ?? '').trim()
    if (runes(note) > 1000) throw new HttpError(400, 'توضیح لاگ خیلی طولانی است')
    const row = (
      await db.W().query(
        `UPDATE worklogs SET ended_at = GREATEST(now(), started_at), note = COALESCE(NULLIF($2, ''), note)
         WHERE user_id = $1 AND ended_at IS NULL RETURNING id`,
        [uid, note],
      )
    ).rows[0]
    if (!row) throw new HttpError(404, 'تایمری در حال اجرا نیست')
    return one(uid, row.id)
  })

  // Per-day activity in the user's timezone; served by a replica.
  r.add('GET', '/stats/daily', async (c) => {
    const u = user(c)
    let days = Number(c.query.get('days'))
    if (!Number.isInteger(days) || days < 1 || days > 800) days = 371
    const tz = u.settings.timezone
    const head = (
      await db.R().query(
        `SELECT ((now() AT TIME ZONE $1)::date - $2::int)::text AS "from", (now() AT TIME ZONE $1)::date::text AS today,
           (((now() AT TIME ZONE $1)::date - $2::int)::timestamp AT TIME ZONE $1) AS since`,
        [tz, days],
      )
    ).rows[0]
    const rows = (
      await db.R().query(
        `SELECT d::text AS d, sum(c)::int AS created, sum(dn)::int AS done, sum(l)::int AS logs, sum(sec)::bigint AS seconds FROM (
           SELECT (created_at AT TIME ZONE $2)::date d, 1 c, 0 dn, 0 l, 0::bigint sec FROM tasks WHERE user_id = $1 AND created_at >= $3
           UNION ALL
           SELECT (done_at AT TIME ZONE $2)::date, 0, 1, 0, 0 FROM tasks WHERE user_id = $1 AND done_at >= $3
           UNION ALL
           SELECT (started_at AT TIME ZONE $2)::date, 0, 0, 1, extract(epoch FROM ended_at - started_at)::bigint
             FROM worklogs WHERE user_id = $1 AND ended_at IS NOT NULL AND started_at >= $3
         ) x GROUP BY d ORDER BY d`,
        [u.id, tz, head.since],
      )
    ).rows
    return { from: head.from, today: head.today, days: rows }
  })
}
