// Encrypted transport: every call is sealed with a fresh ECDH P-256 key against
// the server public key, then AES-256-GCM with HKDF-SHA256 derived keys.
// The method, path, token and body never leave the device in plain text.

const te = new TextEncoder()
const td = new TextDecoder()

let API_URL: string = import.meta.env?.VITE_API_URL ?? ''
const PINNED_KEY: string = import.meta.env?.VITE_SERVER_KEY ?? ''

/** Points the client at another server (used by the smoke test). */
export function setApiUrl(url: string) {
  API_URL = url
  serverKey = null
}

interface ServerKey {
  kid: string
  raw: Uint8Array
  key: CryptoKey
  skew: number
}

let serverKey: Promise<ServerKey> | null = null

function b64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64u(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

async function fetchKey(): Promise<ServerKey> {
  const res = await fetch(`${API_URL}/api/key`, { cache: 'no-store', credentials: 'omit' })
  if (!res.ok) throw new TransportError('سرور در دسترس نیست')
  const j = (await res.json()) as { kid: string; pub: string; now: number }
  if (PINNED_KEY && j.pub !== PINNED_KEY) throw new TransportError('کلید سرور معتبر نیست')
  const raw = unb64u(j.pub)
  const key = await crypto.subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  return { kid: j.kid, raw, key, skew: j.now - Date.now() }
}

function getKey(): Promise<ServerKey> {
  if (!serverKey) {
    serverKey = fetchKey().catch((e) => {
      serverKey = null
      throw e
    })
  }
  return serverKey
}

export class TransportError extends Error {}

export interface SecureResponse {
  status: number
  body: unknown
}

export async function secureCall(method: string, path: string, token: string | null, body?: unknown, retry = true): Promise<SecureResponse> {
  const sk = await getKey()
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  const epk = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: sk.key }, eph.privateKey, 256)
  const hk = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  const salt = concat(epk, sk.raw)
  const derive = (info: string, use: KeyUsage) =>
    crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode(info) }, hk, { name: 'AES-GCM', length: 256 }, false, [use])
  const [reqKey, resKey] = await Promise.all([derive('goprofile/v1/req', 'encrypt'), derive('goprofile/v1/res', 'decrypt')])

  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const plain = te.encode(
    JSON.stringify({ m: method, p: path, t: token ?? '', ts: Date.now() + sk.skew, id: b64u(crypto.getRandomValues(new Uint8Array(16))), b: body ?? null }),
  )
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: te.encode(`gp1|${sk.kid}`) }, reqKey, plain)

  let res: Response
  try {
    res = await fetch(`${API_URL}/api/x`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      body: JSON.stringify({ v: 1, kid: sk.kid, k: b64u(epk), n: b64u(nonce), c: b64u(ct) }),
    })
  } catch {
    throw new TransportError('اتصال به سرور برقرار نشد')
  }
  if (res.status === 409 && retry) {
    serverKey = null
    return secureCall(method, path, token, body, false)
  }
  if (res.status === 429) throw new TransportError('درخواست‌ها زیاد است؛ کمی صبر کنید')
  if (!res.ok) throw new TransportError('پاسخ نامعتبر از سرور')

  const env = (await res.json()) as { n: string; c: string }
  const out = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64u(env.n), additionalData: te.encode(`gp1|${sk.kid}|res`) },
    resKey,
    unb64u(env.c),
  )
  const inner = JSON.parse(td.decode(out)) as { s: number; b: unknown }
  return { status: inner.s, body: inner.b }
}
