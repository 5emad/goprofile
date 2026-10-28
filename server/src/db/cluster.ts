// Routes writes to the primary and balances reads across healthy replicas.
import pg from 'pg'
import { log } from '../log.js'

// Return int8 and date columns as plain JS values.
pg.types.setTypeParser(20, (v) => Number(v))
pg.types.setTypeParser(1082, (v) => v)

interface Replica {
  host: string
  pool: pg.Pool
  healthy: boolean
}

const newPool = (url: string) => {
  const p = new pg.Pool({ connectionString: url, max: 20, idleTimeoutMillis: 300_000, connectionTimeoutMillis: 5_000 })
  p.on('error', (err) => log.warn('idle client error', { err }))
  return p
}

export class Cluster {
  private primary: pg.Pool
  private replicas: Replica[]
  private next = 0
  private timer?: NodeJS.Timeout

  constructor(primaryUrl: string, replicaUrls: string[]) {
    this.primary = newPool(primaryUrl)
    this.replicas = replicaUrls.map((u) => ({ host: new URL(u).host, pool: newPool(u), healthy: false }))
  }

  /** The primary; use it for writes and read-after-write paths. */
  W(): pg.Pool {
    return this.primary
  }

  /** A healthy replica in round-robin order, falling back to the primary. */
  R(): pg.Pool {
    const n = this.replicas.length
    for (let i = 0; i < n; i++) {
      const r = this.replicas[(this.next++ + i) % n]
      if (r.healthy) return r.pool
    }
    return this.primary
  }

  async check() {
    await Promise.all(
      this.replicas.map(async (r) => {
        let ok = false
        try {
          // Healthy while in recovery and less than 30s behind.
          const res = await r.pool.query({
            text: `SELECT pg_is_in_recovery() AND COALESCE(now() - pg_last_xact_replay_timestamp() < interval '30 seconds'
              OR pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn(), false) AS ok`,
            query_timeout: 2000,
          } as pg.QueryConfig)
          ok = res.rows[0]?.ok === true
        } catch {
          ok = false
        }
        if (r.healthy !== ok) log.info('replica state changed', { host: r.host, healthy: ok })
        r.healthy = ok
      }),
    )
  }

  watch() {
    this.timer = setInterval(() => void this.check(), 5000)
    this.timer.unref()
    return this.check()
  }

  async close() {
    clearInterval(this.timer)
    await Promise.all([this.primary.end(), ...this.replicas.map((r) => r.pool.end())])
  }
}
