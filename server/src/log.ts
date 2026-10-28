// Structured JSON logs on stdout.
function write(level: string, msg: string, fields: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(fields)) if (v instanceof Error) fields[k] = v.message
  process.stdout.write(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }) + '\n')
}

export const log = {
  info: (msg: string, f?: Record<string, unknown>) => write('INFO', msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write('WARN', msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write('ERROR', msg, f),
}
