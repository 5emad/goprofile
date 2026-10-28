const env = (k: string, def: string) => process.env[k] || def

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

const flag = (k: string, def: boolean) => {
  const v = process.env[k]
  return v ? ['1', 'true', 'yes'].includes(v.toLowerCase()) : def
}

export const config = {
  port: Number(env('PORT', '8080')),
  databaseUrl: env('DATABASE_URL', 'postgres://goprofile:goprofile@localhost:5432/goprofile'),
  replicaUrls: list(env('DATABASE_REPLICA_URLS', '')),
  keyFile: env('KEY_FILE', 'data/server.key'),
  allowedOrigins: list(env('ALLOWED_ORIGINS', 'https://goprofile.ir,app://goprofile,https://localhost,http://localhost:5173')),
  allowSignup: flag('ALLOW_SIGNUP', true),
  trustProxy: flag('TRUST_PROXY', false),
  sessionTtlHours: Number(env('SESSION_TTL_HOURS', '720')),
}

export type Config = typeof config
