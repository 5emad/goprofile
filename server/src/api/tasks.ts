import type { Cluster } from '../db/cluster.js'
import { tx } from '../db/migrate.js'
import { ownsBoard } from './boards.js'
import { body, created, dateRe, field, HttpError, id, runes, Setter, user, type Ctx, type Router } from './http.js'
import { queryWorklogs } from './worklogs.js'

const TASK_SELECT = `SELECT t.id, t.board_id, b.name AS board_name, b.key || '-' || t.number AS key, t.number, t.jira_key, t.title, t.description,
  t.status_id, t.phase_id, t.epic_id, t.category_id, t.priority, t.estimate_minutes, t.due_on, t.position,
  t.created_at, t.updated_at, t.done_at,
  COALESCE((SELECT sum(extract(epoch FROM COALESCE(w.ended_at, now()) - w.started_at))::bigint FROM worklogs w WHERE w.task_id = t.id), 0) AS logged_seconds,
  EXISTS(SELECT 1 FROM worklogs w WHERE w.task_id = t.id AND w.ended_at IS NULL) AS running
  FROM tasks t JOIN boards b ON b.id = t.board_id `

const REFS = ['status_id', 'phase_id', 'epic_id', 'category_id'] as const

function taskInput(c: Ctx) {
  const b = body(c, ['board_id', 'jira_key', 'title', 'description', ...REFS, 'priority', 'estimate_minutes', 'due_on', 'position'])
  let title = field<string>(b, 'title', 'string')
  let jira = field<string>(b, 'jira_key', 'string')
  const description = field<string>(b, 'description', 'string')
  const priority = field<number>(b, 'priority', 'int')
  const estimate = field<number>(b, 'estimate_minutes', 'int')
  const due = field<string>(b, 'due_on', 'string', true)
  const refs = Object.fromEntries(REFS.map((k) => [k, field<number>(b, k, 'int', true)])) as Record<(typeof REFS)[number], number | null | undefined>
  if (title !== undefined) {
    title = title.trim()
    if (!title || runes(title) > 300) throw new HttpError(400, 'عنوان تسک لازم است (حداکثر ۳۰۰ کاراکتر)')
  }
  if (description !== undefined && description.length > 50_000) throw new HttpError(400, 'توضیحات خیلی طولانی است')
  if (jira !== undefined) {
    jira = jira.trim().toUpperCase()
    if (jira.length > 40) throw new HttpError(400, 'شماره تسک خیلی طولانی است')
  }
  if (priority !== undefined && (priority < 0 || priority > 4)) throw new HttpError(400, 'اولویت معتبر نیست')
  if (estimate !== undefined && (estimate < 0 || estimate > 100_000)) throw new HttpError(400, 'تخمین زمان معتبر نیست')
  if (due && !dateRe.test(due)) throw new HttpError(400, 'تاریخ معتبر نیست')
  return {
    boardId: field<number>(b, 'board_id', 'int'),
    title,
    jira,
    description,
    priority,
    estimate,
    due,
    position: field<number>(b, 'position', 'number'),
    refs,
  }
}

/** Checks that every referenced lookup row belongs to the board. */
async function refsBelong(db: Cluster, bid: number, refs: Record<string, number | null | undefined>) {
  const v = (k: string) => refs[k] ?? null
  const row = (
    await db.W().query(
      `SELECT
        ($2::bigint IS NULL OR EXISTS(SELECT 1 FROM statuses WHERE id = $2 AND board_id = $1)) AND
        ($3::bigint IS NULL OR EXISTS(SELECT 1 FROM phases WHERE id = $3 AND board_id = $1)) AND
        ($4::bigint IS NULL OR EXISTS(SELECT 1 FROM epics WHERE id = $4 AND board_id = $1)) AND
        ($5::bigint IS NULL OR EXISTS(SELECT 1 FROM categories WHERE id = $5 AND board_id = $1)) AS ok`,
      [bid, v('status_id'), v('phase_id'), v('epic_id'), v('category_id')],
    )
  ).rows[0]
  return row.ok === true
}

export function taskRoutes(r: Router, db: Cluster) {
  const loadTask = async (uid: number, tid: number) => {
    const t = (await db.W().query(TASK_SELECT + 'WHERE t.id = $1 AND t.user_id = $2', [tid, uid])).rows[0]
    if (!t) throw new HttpError(404, 'تسک پیدا نشد')
    return t
  }

  r.add('GET', '/tasks', async (c) => {
    const where = ['t.user_id = $1']
    const args: unknown[] = [user(c).id]
    for (const f of ['board_id', ...REFS]) {
      const v = c.query.get(f)
      if (v) {
        if (!/^\d+$/.test(v)) throw new HttpError(400, 'فیلتر معتبر نیست')
        args.push(Number(v))
        where.push(`t.${f} = $${args.length}`)
      }
    }
    const q = (c.query.get('q') ?? '').trim()
    if (q) {
      args.push(`%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`)
      const n = args.length
      where.push(`(t.title ILIKE $${n} OR t.jira_key ILIKE $${n} OR (b.key || '-' || t.number) ILIKE $${n})`)
    }
    if (c.query.get('open') === '1') where.push('t.done_at IS NULL')
    return (await db.W().query(`${TASK_SELECT}WHERE ${where.join(' AND ')} ORDER BY t.position, t.id LIMIT 2000`, args)).rows
  })

  r.add('GET', '/tasks/:id', async (c) => {
    const uid = user(c).id
    const t = await loadTask(uid, id(c))
    t.worklogs = await queryWorklogs(db.W(), 'w.task_id = $1 AND w.user_id = $2', [t.id, uid])
    return t
  })

  r.add('POST', '/tasks', async (c) => {
    const uid = user(c).id
    const inp = taskInput(c)
    if (inp.boardId === undefined || inp.title === undefined) throw new HttpError(400, 'کارتابل و عنوان تسک لازم است')
    const bid = inp.boardId
    if (!(await ownsBoard(db, uid, bid)) || !(await refsBelong(db, bid, inp.refs))) throw new HttpError(400, 'کارتابل یا دسته‌بندی معتبر نیست')
    const tid = await tx(db.W(), async (q) => {
      const number = (await q.query('UPDATE boards SET next_number = next_number + 1 WHERE id = $1 RETURNING next_number - 1 AS n', [bid])).rows[0].n
      let status = inp.refs.status_id ?? null
      if (status === null) status = (await q.query('SELECT id FROM statuses WHERE board_id = $1 ORDER BY position, id LIMIT 1', [bid])).rows[0]?.id ?? null
      return (
        await q.query(
          `INSERT INTO tasks (board_id, user_id, number, jira_key, title, description, status_id,
             phase_id, epic_id, category_id, priority, estimate_minutes, due_on, position, done_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULLIF($13, '')::date,
             (SELECT COALESCE(max(position), 0) + 1 FROM tasks WHERE board_id = $1),
             CASE WHEN (SELECT is_done FROM statuses WHERE id = $7) THEN now() END)
           RETURNING id`,
          [
            bid,
            uid,
            number,
            inp.jira ?? '',
            inp.title,
            inp.description ?? '',
            status,
            inp.refs.phase_id ?? null,
            inp.refs.epic_id ?? null,
            inp.refs.category_id ?? null,
            inp.priority ?? 2,
            inp.estimate ?? 0,
            inp.due ?? '',
          ],
        )
      ).rows[0].id as number
    })
    return created(await loadTask(uid, tid))
  })

  r.add('PATCH', '/tasks/:id', async (c) => {
    const uid = user(c).id
    const tid = id(c)
    const inp = taskInput(c)
    const cur = await loadTask(uid, tid)
    if (inp.boardId !== undefined && inp.boardId !== cur.board_id) throw new HttpError(400, 'جابجایی تسک بین کارتابل‌ها پشتیبانی نمی‌شود')
    if (!(await refsBelong(db, cur.board_id, inp.refs))) throw new HttpError(400, 'دسته‌بندی معتبر نیست')
    const s = new Setter()
    s.add('jira_key', inp.jira)
    s.add('title', inp.title)
    s.add('description', inp.description)
    s.add('priority', inp.priority)
    s.add('estimate_minutes', inp.estimate)
    s.add('position', inp.position)
    for (const k of ['phase_id', 'epic_id', 'category_id'] as const) s.add(k, inp.refs[k])
    if (inp.due !== undefined) s.raw('due_on', "NULLIF(%s, '')::date", inp.due ?? '')
    if (inp.refs.status_id !== undefined) {
      s.add('status_id', inp.refs.status_id)
      s.raw('done_at', 'CASE WHEN (SELECT is_done FROM statuses WHERE id = %s) THEN COALESCE(done_at, now()) END', inp.refs.status_id)
    }
    if (!s.empty) {
      s.expr('updated_at', 'now()')
      await db.W().query(`${s.update('tasks')} WHERE id = ${s.arg(tid)} AND user_id = ${s.arg(uid)}`, s.args)
    }
    return loadTask(uid, tid)
  })

  r.add('DELETE', '/tasks/:id', async (c) => {
    const res = await db.W().query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id(c), user(c).id])
    if (!res.rowCount) throw new HttpError(404, 'تسک پیدا نشد')
    return { ok: true }
  })
}
