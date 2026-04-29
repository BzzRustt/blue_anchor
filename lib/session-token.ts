import { createHmac, timingSafeEqual } from 'crypto'

const VERSION = '1'

/**
 * Generate an HMAC-signed session token embedding a timestamp.
 * Format: "1.<base36-timestamp>.<sha256-hex>"
 *
 * Token is self-validating — no DB lookup needed to verify freshness or integrity.
 * Uses ADMIN_PASS as the signing secret (already a required env var).
 */
export function generateSessionToken(secret: string): string {
  const ts = Date.now().toString(36)
  const payload = `${VERSION}.${ts}`
  const mac = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${mac}`
}

/**
 * Verify a session token.
 * Returns the issue timestamp in milliseconds, or null if the token is
 * invalid, malformed, or was signed with a different secret.
 */
export function verifySessionToken(token: string, secret: string): number | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [ver, tsPart, mac] = parts
  if (ver !== VERSION) return null

  const ts = parseInt(tsPart, 36)
  if (isNaN(ts) || ts <= 0) return null

  const expected = createHmac('sha256', secret).update(`${ver}.${tsPart}`).digest('hex')

  try {
    const a = Buffer.from(mac, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }

  return ts
}
