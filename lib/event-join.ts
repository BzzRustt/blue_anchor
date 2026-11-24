/**
 * Server side of joining an event as an attendee (no account).
 *
 * Reads go through the SECURITY DEFINER functions in lib/db/rls.sql (join_event_info,
 * register_attendee) or through withAttendeeDb, which installs the verified attendee id so
 * RLS — not just this file — stops one attendee touching another's card.
 */
import { cache } from 'react'
import { and, eq, sql } from 'drizzle-orm'
import { cookies, headers } from 'next/headers'
import { publicLabel } from '@/lib/events'
import { schema, visitorDb, withAttendeeDb } from '@/lib/db'
import { signAttendeeToken, verifyAttendeeToken } from '@/lib/attendee-token'
import type { Role } from '@/lib/events'
import type { Plan } from '@/lib/plans'
import { RateLimiter } from '@/lib/rate-limiter'
import { requestIp } from '@/lib/request-ip'

export interface Question {
  id: string
  /** Asked on the join form, e.g. "What can you help with?" */
  prompt: string
  /** Shown above the answer on someone's card, e.g. "Can help with". */
  label: string
  placeholder: string
  required: boolean
}

export interface JoinContext {
  eventId: string
  name: string
  venue: string | null
  startsAt: Date
  endsAt: Date
  expiresAt: Date
  roles: Role[]
  plan: Plan
  attendeeCount: number
  /** Purchased capacity for this event; null for events that predate paid publishing. */
  capacity: number | null
  questions: Question[]
}

export interface MyCard {
  id: string
  eventId: string
  tag: string
  roleLetter: string | null
  displayName: string
  answers: Record<string, string>
  status: 'invited' | 'complete' | 'withdrawn'
}

/**
 * Sized for a room, not a person: 50 attendees share one venue WiFi address, so the
 * 5-per-hour limit used for private feedback would lock out the event. The plan's
 * attendee cap is the real bound on abuse; this only stops a single address hammering.
 * Counts every attempt, not only successes, so failing requests cannot be free.
 */
export const joinLimiter = new RateLimiter(200, 3_600_000)

export async function clientKey(eventId: string): Promise<string> {
  return `${eventId}:${requestIp(await headers())}`
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set.')
  return secret
}

/** The event behind a public slug, or null when it is closed, expired or does not exist. Cached per request. */
export const getJoinContext = cache(async (slug: string): Promise<JoinContext | null> => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null

  // One round trip: the event and its question blocks together (each query is a separate HTTPS call).
  const result = await visitorDb.execute(sql`select i.*, (select coalesce(json_agg(json_build_object('id', b.id, 'type', b.type, 'required', b.required, 'config', b.config) order by b.position), '[]'::json)
    from question_blocks b where b.campaign_id = i.campaign_id) as blocks from join_event_info(${slug}) i`)
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Array<Record<string, unknown>>
  const row = rows[0]
  if (!row) return null

  const blocks = (row.blocks ?? []) as Array<{ id: string; type: string; required: boolean; config: unknown }>

  return {
    eventId: String(row.event_id),
    name: String(row.event_name),
    venue: row.venue ? String(row.venue) : null,
    startsAt: new Date(String(row.starts_at)),
    endsAt: new Date(String(row.ends_at)),
    expiresAt: new Date(String(row.directory_expires_at)),
    roles: Array.isArray(row.role_set) ? (row.role_set as Role[]) : [],
    plan: String(row.organiser_plan) as Plan,
    attendeeCount: Number(row.attendee_count),
    capacity: row.capacity == null ? null : Number(row.capacity),
    questions: blocks
      .filter((block) => block.type === 'open_text')
      .map((block) => {
        const config = block.config as { prompt?: string; placeholder?: string; label?: string }
        const prompt = config.prompt ?? 'Your answer'
        return { id: block.id, prompt, label: config.label?.trim() || publicLabel(prompt), placeholder: config.placeholder ?? '', required: block.required }
      }),
  }
})

/* ── Identity ─────────────────────────────────────────────────────────────── */

const cookieName = (eventId: string) => `sm_att_${eventId.slice(0, 8)}`

/** Attaches proof of identity to the response. Expires with the directory window. */
export async function rememberAttendee(ctx: Pick<JoinContext, 'eventId' | 'expiresAt'>, attendeeId: string) {
  const jar = await cookies()
  jar.set(cookieName(ctx.eventId), signAttendeeToken(attendeeId, ctx.expiresAt, sessionSecret()), cookieOptions(ctx.expiresAt))
}

export const cookieOptions = (expires: Date) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  expires,
})

export { cookieName }

/** The attendee id this browser has proven for this event, or null. */
export async function verifiedAttendeeId(eventId: string): Promise<string | null> {
  const token = (await cookies()).get(cookieName(eventId))?.value
  return token ? verifyAttendeeToken(token, sessionSecret()) : null
}

/**
 * The caller's own card. Named columns only: `email` and `claim_token` are not granted to
 * the visitor role, so a bare select() would be refused by the database.
 */
export async function loadMyCard(attendeeId: string, eventId: string): Promise<MyCard | null> {
  const [card] = await withAttendeeDb(attendeeId, (tx) => tx
    .select({
      id: schema.eventAttendees.id,
      eventId: schema.eventAttendees.eventId,
      tag: schema.eventAttendees.tag,
      roleLetter: schema.eventAttendees.roleLetter,
      displayName: schema.eventAttendees.displayName,
      answers: schema.eventAttendees.answers,
      status: schema.eventAttendees.status,
    })
    .from(schema.eventAttendees)
    .where(and(eq(schema.eventAttendees.id, attendeeId), eq(schema.eventAttendees.eventId, eventId)))
    .limit(1))
  return card ? { ...card, answers: (card.answers ?? {}) as Record<string, string> } : null
}
