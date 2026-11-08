/**
 * Proof of "this browser is attendee X", for people who have no account.
 *
 * Format: "1.<attendee uuid>.<expiry, base36 ms>.<hmac-sha256 hex>". Self-validating: no
 * lookup is needed to check integrity or freshness. The expiry is the end of the event's
 * directory window, so a token can never outlive the data it unlocks.
 *
 * Pure (no framework, no `@/` alias) so it runs under `node --test`. Modelled on
 * lib/session-token.ts, which signs an anonymous visitor with no identity at all.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const VERSION = '1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function signAttendeeToken(attendeeId: string, expiresAt: Date, secret: string): string {
  if (!UUID.test(attendeeId)) throw new Error('attendee id must be a uuid')
  const payload = `${VERSION}.${attendeeId.toLowerCase()}.${expiresAt.getTime().toString(36)}`
  return `${payload}.${mac(payload, secret)}`
}

/** The attendee id the token vouches for, or null if it is forged, expired or malformed. */
export function verifyAttendeeToken(token: string, secret: string, now: number = Date.now()): string | null {
  const parts = token.split('.')
  if (parts.length !== 4) return null

  const [version, id, expiry, signature] = parts
  if (version !== VERSION || !UUID.test(id)) return null

  const expiresAt = parseInt(expiry, 36)
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null

  const given = Buffer.from(signature, 'hex')
  const expected = Buffer.from(mac(`${version}.${id}.${expiry}`, secret), 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  return id
}
