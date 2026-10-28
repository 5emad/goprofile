import assert from 'node:assert/strict'
import { createCipheriv, createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Keys, ReplayGuard } from './envelope.js'

// Mimics the client side of the protocol.
function seal(k: Keys, msg: string) {
  const eph = createECDH('prime256v1')
  const epk = eph.generateKeys()
  const shared = eph.computeSecret(k.pub)
  const salt = Buffer.concat([epk, k.pub])
  const key = (info: string) => Buffer.from(hkdfSync('sha256', shared, salt, info, 32))
  const nonce = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key('goprofile/v1/req'), nonce)
  c.setAAD(Buffer.from(`gp1|${k.kid}`))
  const ct = Buffer.concat([c.update(msg), c.final(), c.getAuthTag()])
  return { env: { v: 1, kid: k.kid, k: epk.toString('base64url'), n: nonce.toString('base64url'), c: ct.toString('base64url') }, resKey: key('goprofile/v1/res') }
}

test('round trip and tamper detection', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'gp-')), 'k')
  const k = Keys.loadOrCreate(path)
  assert.equal(Keys.loadOrCreate(path).kid, k.kid)

  const { env, resKey } = seal(k, 'hello')
  const [plain, session] = k.open(env)
  assert.equal(plain.toString(), 'hello')

  const r = session.seal(Buffer.from('world'))
  const ct = Buffer.from(r.c, 'base64url')
  const d = createDecipheriv('aes-256-gcm', resKey, Buffer.from(r.n, 'base64url'))
  d.setAAD(Buffer.from(`gp1|${k.kid}|res`))
  d.setAuthTag(ct.subarray(ct.length - 16))
  assert.equal(Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString(), 'world')

  assert.throws(() => k.open({ ...env, c: env.c.slice(0, -2) + 'AA' }))
})

test('replay guard', () => {
  const g = new ReplayGuard(60_000)
  assert.ok(g.accept('a', Date.now()))
  assert.ok(!g.accept('a', Date.now()))
  assert.ok(!g.accept('b', Date.now() - 120_000))
})
