// Encrypted request envelope used by every API call.
//
// Each request carries a fresh client ECDH P-256 public key. Both sides derive
// separate AES-256-GCM keys for the request and the response with HKDF-SHA256
// over the shared secret, so captured traffic cannot be read without the
// server private key.
import { createCipheriv, createDecipheriv, createECDH, createHash, hkdfSync, randomBytes, type ECDH } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const ALG = 'ECDH-P256+HKDF-SHA256+A256GCM'
const INFO_REQ = 'goprofile/v1/req'
const INFO_RES = 'goprofile/v1/res'

const b64u = (b: Buffer) => b.toString('base64url')
const unb64u = (s: string) => Buffer.from(s, 'base64url')

export class EnvelopeError extends Error {}

export interface Envelope {
  v: number
  kid: string
  k: string
  n: string
  c: string
}

export interface Reply {
  n: string
  c: string
}

export class Session {
  constructor(
    private resKey: Buffer,
    private kid: string,
  ) {}

  /** Encrypts the response body with a fresh nonce. */
  seal(plain: Buffer): Reply {
    const nonce = randomBytes(12)
    const c = createCipheriv('aes-256-gcm', this.resKey, nonce)
    c.setAAD(Buffer.from(`gp1|${this.kid}|res`))
    const ct = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()])
    return { n: b64u(nonce), c: b64u(ct) }
  }
}

export class Keys {
  readonly kid: string
  readonly pub: Buffer

  private constructor(private ecdh: ECDH) {
    this.pub = ecdh.getPublicKey()
    this.kid = createHash('sha256').update(this.pub).digest('hex').slice(0, 16)
  }

  /** Reads the hex private key, creating it with 0600 permissions on first run. */
  static loadOrCreate(path: string): Keys {
    const ecdh = createECDH('prime256v1')
    try {
      ecdh.setPrivateKey(Buffer.from(readFileSync(path, 'utf8').trim(), 'hex'))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`key file: ${(err as Error).message}`)
      ecdh.generateKeys()
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
      writeFileSync(path, ecdh.getPrivateKey('hex'), { mode: 0o600 })
    }
    return new Keys(ecdh)
  }

  get publicKey() {
    return b64u(this.pub)
  }

  /** Decrypts a request envelope and returns its plaintext and a session for the reply. */
  open(e: Envelope): [Buffer, Session] {
    if (e?.v !== 1 || e.kid !== this.kid || typeof e.k !== 'string' || typeof e.n !== 'string' || typeof e.c !== 'string') {
      throw new EnvelopeError('envelope')
    }
    const epk = unb64u(e.k)
    const nonce = unb64u(e.n)
    const ct = unb64u(e.c)
    if (nonce.length !== 12 || ct.length < 16) throw new EnvelopeError('envelope')
    let shared: Buffer
    try {
      shared = this.ecdh.computeSecret(epk)
    } catch {
      throw new EnvelopeError('envelope')
    }
    const salt = Buffer.concat([epk, this.pub])
    const reqKey = Buffer.from(hkdfSync('sha256', shared, salt, INFO_REQ, 32))
    const resKey = Buffer.from(hkdfSync('sha256', shared, salt, INFO_RES, 32))
    try {
      const d = createDecipheriv('aes-256-gcm', reqKey, nonce)
      d.setAAD(Buffer.from(`gp1|${this.kid}`))
      d.setAuthTag(ct.subarray(ct.length - 16))
      const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()])
      return [plain, new Session(resKey, this.kid)]
    } catch {
      throw new EnvelopeError('envelope')
    }
  }
}

/** Rejects request ids seen within the freshness window. */
export class ReplayGuard {
  private seen = new Map<string, number>()
  constructor(private windowMs: number) {}

  accept(id: unknown, ts: unknown): boolean {
    const now = Date.now()
    if (typeof id !== 'string' || !id || id.length > 64 || typeof ts !== 'number' || Math.abs(now - ts) > this.windowMs) return false
    if (this.seen.has(id)) return false
    if (this.seen.size > 50_000) {
      for (const [k, t] of this.seen) if (now - t > 2 * this.windowMs) this.seen.delete(k)
    }
    this.seen.set(id, now)
    return true
  }
}
