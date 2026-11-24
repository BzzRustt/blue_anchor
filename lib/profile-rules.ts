/**
 * Pure rules for personal codes, nicknames and photo uploads. No `@/` alias, so they run under
 * `node --test` (see profile-rules.test.ts).
 */
import { randomInt } from 'node:crypto'

/** No 0/o, 1/l/i: easy to read aloud and type from a sticker. 31^7 is about 27.5 billion codes. */
export const CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
export const CODE_LENGTH = 7

/** A new personal code: short, random, never derived from the owner's name. */
export function shortCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

/** Words a nickname can't be, because they are (or may become) pages of their own. */
const RESERVED = new Set(['app', 'admin', 'api', 'login', 'logout', 'signup', 'signin', 'plans', 'pricing', 'help', 'support', 'settings', 'profile', 'shop', 'events', 'event', 'scanme', 'about', 'terms', 'privacy', 'legal', 'how-it-works', 'reset-password', 'forgot-password', 'null', 'undefined', 'root', 'www', 'mail'])

/** A nickname: 3 to 20 characters, letters, digits, dot and underscore, stored lower-case. Returns the cleaned value or an error. */
export function checkNickname(raw: string): { ok: true; value: string | null } | { ok: false; reason: string } {
  const value = raw.trim().replace(/^@/, '').toLowerCase()
  if (!value) return { ok: true, value: null }
  if (value.length < 3 || value.length > 20) return { ok: false, reason: 'A nickname is 3 to 20 characters.' }
  if (!/^[a-z0-9._]+$/.test(value)) return { ok: false, reason: 'Use only letters, numbers, dots and underscores.' }
  if (/^[._]|[._]$|\.\./.test(value)) return { ok: false, reason: 'A nickname can’t start or end with a dot or underscore.' }
  if (RESERVED.has(value)) return { ok: false, reason: 'That nickname is reserved. Try another.' }
  return { ok: true, value }
}

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024

/** What the file really is, from its first bytes (never the name or the browser's claim), or null. */
export function imageKind(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return 'png'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'webp'
  return null
}
