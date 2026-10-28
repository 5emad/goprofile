// End-to-end smoke test against a running API through the encrypted gateway.
//   node scripts/smoke.ts http://localhost:8080
import { secureCall, setApiUrl } from '../src/core/secure.ts'

const base = process.argv[2] ?? 'http://localhost:8080'
setApiUrl(base)

let token: string | null = null
let failed = 0

async function call<T = any>(method: string, path: string, body?: unknown, want = 200): Promise<T> {
  const r = await secureCall(method, path, token, body)
  if (r.status !== want) {
    failed++
    console.error(`FAIL ${method} ${path}: ${r.status} ${JSON.stringify(r.body)}`)
  } else {
    console.log(`ok   ${method} ${path} -> ${r.status}`)
  }
  return r.body as T
}

const email = `smoke-${Date.now()}@example.com`
const reg = await call('POST', '/auth/register', { name: 'تست', email, password: 'very-secret-pass' })
token = reg.token
await call('POST', '/auth/login', { email, password: 'wrong-password!!' }, 401)
await call('GET', '/me')
await call('PATCH', '/me', { settings: { jira_mode: true, timezone: 'Asia/Tehran', daily_goal_minutes: 300, theme: 'dark' } })

const boards = await call<any[]>('GET', '/boards')
const board = boards[0]
const withEpic = await call('POST', `/boards/${board.id}/epics`, { name: 'پرداخت', color: '#8aa665' })
const epic = withEpic.epics[0]
await call('POST', `/boards/${board.id}/phases`, { name: 'فاز ۱', starts_on: '2026-10-01', ends_on: '' })
const task = await call('POST', '/tasks', { board_id: board.id, title: 'صفحه ورود', jira_key: 'pay-12', epic_id: epic.id }, 201)
if (task.key !== 'GP-1' || task.jira_key !== 'PAY-12') {
  failed++
  console.error('FAIL task numbering', task.key, task.jira_key)
}

const done = board.statuses.find((s: any) => s.is_done)
const moved = await call('PATCH', `/tasks/${task.id}`, { status_id: done.id, position: 5, epic_id: null })
if (!moved.done_at || moved.epic_id !== null) {
  failed++
  console.error('FAIL done_at/epic clear', moved)
}

await call('POST', `/tasks/${task.id}/timer`, undefined, 201)
const running = await call('GET', '/timer')
if (!running || running.ended_at !== null) {
  failed++
  console.error('FAIL timer not running')
}
await call('POST', '/timer/stop', { note: 'تمام شد' })
await call('POST', '/timer/stop', {}, 404)
await call('POST', `/tasks/${task.id}/timer`, undefined, 201)
await call('POST', '/timer/stop', {})

const start = new Date(Date.now() - 3 * 3600_000).toISOString()
const log = await call('POST', `/tasks/${task.id}/worklogs`, { started_at: start, minutes: 90, note: 'دستی' }, 201)
if (log.seconds !== 5400) {
  failed++
  console.error('FAIL manual log seconds', log.seconds)
}
const full = await call('GET', `/tasks/${task.id}`)
if (full.worklogs.length !== 3) {
  failed++
  console.error('FAIL worklog count', full.worklogs.length)
}

const today = new Date().toISOString().slice(0, 10)
const week = await call<any[]>('GET', `/worklogs?from=${today.slice(0, 8)}01&to=${today}`)
if (!week.some((w) => w.id === log.id)) {
  failed++
  console.error('FAIL worklog range')
}
const stats = await call('GET', '/stats/daily?days=30')
const contributions = stats.days.reduce((s: number, d: any) => s + d.created + d.done + d.logs, 0)
if (contributions < 4) {
  failed++
  console.error('FAIL stats', stats)
}

// Another user must not see this task.
const other = await secureCall('POST', '/auth/register', null, { name: 'دیگری', email: `o-${email}`, password: 'very-secret-pass' })
const otherToken = (other.body as any).token
const peek = await secureCall('GET', `/tasks/${task.id}`, otherToken)
if (peek.status !== 404) {
  failed++
  console.error('FAIL isolation', peek.status)
} else console.log('ok   other user cannot read task')

await call('DELETE', `/worklogs/${log.id}`)
await call('POST', '/auth/logout')
token = reg.token
await call('GET', '/me', undefined, 401)

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
process.exit(failed ? 1 : 0)
