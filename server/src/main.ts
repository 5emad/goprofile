import { config } from './config.js'
import { Cluster } from './db/cluster.js'
import { migrate } from './db/migrate.js'
import { log } from './log.js'
import { Keys } from './secure/envelope.js'
import { buildServer } from './server.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const db = new Cluster(config.databaseUrl, config.replicaUrls)

  // Wait for the primary to accept connections.
  for (let i = 0; ; i++) {
    try {
      await db.W().query('SELECT 1')
      break
    } catch (err) {
      if (i >= 30) throw err
      log.warn('waiting for database', { err: err as Error })
      await sleep(2000)
    }
  }
  await migrate(db.W())
  await db.watch()

  const keys = Keys.loadOrCreate(config.keyFile)
  log.info('server key loaded', { kid: keys.kid, pub: keys.publicKey })

  const server = buildServer(config, db, keys)
  server.listen(config.port, () => log.info('listening', { port: config.port }))

  const shutdown = () => {
    log.info('shutting down')
    server.close(() => void db.close().then(() => process.exit(0)))
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  log.error('fatal', { err })
  process.exit(1)
})
