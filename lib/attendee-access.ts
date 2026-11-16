/**
 * Personal attendee access links. The token travels only in the link; the database keeps
 * sha256(token) hex, the same hash redeem_attendee_access() computes in SQL.
 * Pure (no `@/` alias) so it runs under `node --test`.
 */
import { createHash, randomBytes } from 'node:crypto'

export const hashAccessToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')

export function newAccessToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex')
  return { token, hash: hashAccessToken(token) }
}

export const VISIBILITY_LEVELS = ['full', 'name', 'hidden'] as const
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number]
export const asVisibility = (value: unknown): VisibilityLevel =>
  VISIBILITY_LEVELS.includes(value as VisibilityLevel) ? (value as VisibilityLevel) : 'full'
