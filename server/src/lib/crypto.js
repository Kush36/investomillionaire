import crypto from 'node:crypto'

// AES-256-GCM. The tag is stored with the ciphertext so tampering is detected on
// read rather than silently returning garbage.
const ALGO = 'aes-256-gcm'

function key() {
  const raw = process.env.FIELD_ENCRYPTION_KEY
  if (!raw) throw new Error('FIELD_ENCRYPTION_KEY is missing. Generate one with: openssl rand -hex 32')
  const buf = Buffer.from(raw, 'hex')
  if (buf.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes of hex (64 characters)')
  return buf
}

export function encryptField(plain) {
  if (plain == null || plain === '') return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key(), iv)
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

export function decryptField(payload) {
  if (!payload) return null
  const [ivB64, tagB64, dataB64] = String(payload).split('.')
  if (!ivB64 || !tagB64 || !dataB64) return null
  try {
    const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    // Wrong key, or the stored value was tampered with.
    return null
  }
}

// A blind index, so a mobile number can be looked up without ever decrypting the
// column. Deterministic by design, which is the whole point.
export function fingerprint(value) {
  return crypto
    .createHmac('sha256', key())
    .update(String(value).trim())
    .digest('hex')
}

export function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex')
}

export function generateOtp() {
  // Six digits, uniform, from a cryptographic source.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}
