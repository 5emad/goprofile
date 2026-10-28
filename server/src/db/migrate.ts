import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'
import { log } from '../log.js'

const dir = fileURLToPath(new URL('./migrations/', import.meta.url))

/** Applies pending migrations in order, guarded by an advisory lock. */
export async function migrate(pool: pg.Pool) {
  const c = await pool.connect()
  try {
    await c.query('SELECT pg_advisory_lock(7310421)')
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      const { rowCount } = await c.query('SELECT 1 FROM schema_migrations WHERE version = $1', [name])
      if (rowCount) continue
      try {
        await c.query('BEGIN')
        await c.query(readFileSync(dir + name, 'utf8'))
        await c.query('INSERT INTO schema_migrations (version) VALUES ($1)', [name])
        await c.query('COMMIT')
        log.info('migration applied', { version: name })
      } catch (err) {
        await c.query('ROLLBACK')
        throw new Error(`migration ${name}: ${(err as Error).message}`)
      }
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock(7310421)').catch(() => {})
    c.release()
  }
}

/** Runs fn inside a transaction on one pooled connection. */
export async function tx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    const out = await fn(c)
    await c.query('COMMIT')
    return out
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    c.release()
  }
}
