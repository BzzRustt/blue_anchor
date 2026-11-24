/**
 * Server helpers for finding people, saved people and message requests (M6 + M7).
 * Every rule (timing, visibility, blocks, caps) is enforced by the SQL functions in
 * lib/db/rls.sql; this file only calls them as the verified attendee and maps their
 * short error codes to wording.
 */
import { sql } from 'drizzle-orm'
import { visitorDb, withAttendeeDb } from '@/lib/db'
import { getJoinContext, loadMyCard, verifiedAttendeeId, type JoinContext, type MyCard } from '@/lib/event-join'

export type NetworkingState = 'before' | 'live' | 'follow_up' | 'closed'
export interface Networking {
  state: NetworkingState
  discovery: 'off' | 'badge' | 'directory'
  messaging: boolean
  opensAt: Date
  repliesUntil: Date
  /** Accepted conversations can still take replies (decided by the database clock). */
  repliesOpen: boolean
}

export interface FoundPerson {
  id: string
  tag: string
  role_letter: string | null
  display_name: string
  answers: Record<string, string>
  visibility: 'name' | 'full'
  allow_messages: boolean
}

export const rowsOf = <T>(result: unknown): T[] =>
  (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as T[]

export async function networkingInfo(eventId: string): Promise<Networking> {
  const [row] = rowsOf<{ state: NetworkingState; discovery: Networking['discovery']; messaging: boolean; opens_at: string; replies_until: string; replies_open: boolean }>(
    await visitorDb.execute(sql`select *, now() < replies_until as replies_open from event_networking(${eventId}::uuid)`)
  )
  return { state: row?.state ?? 'closed', discovery: row?.discovery ?? 'off', messaging: !!row?.messaging, opensAt: new Date(row?.opens_at ?? 0), repliesUntil: new Date(row?.replies_until ?? 0), repliesOpen: !!row?.replies_open && (row.state === 'live' || row.state === 'follow_up') }
}

/** The event plus the verified attendee using this browser, or null for either. */
export async function attendeeSession(slug: string): Promise<{ ctx: JoinContext; me: MyCard | null } | null> {
  const ctx = await getJoinContext(slug)
  if (!ctx) return null
  const id = await verifiedAttendeeId(ctx.eventId)
  const me = id ? await loadMyCard(id, ctx.eventId) : null
  return { ctx, me: me && me.status !== 'withdrawn' ? me : null }
}

export async function unreadCount(attendeeId: string): Promise<number> {
  const [row] = await withAttendeeDb(attendeeId, async (tx) => rowsOf<{ n: number }>(await tx.execute(sql`
    select count(*)::int as n from event_messages m join message_requests r on r.id = m.request_id
    where m.read_at is null and m.from_attendee_id <> ${attendeeId}::uuid
      and (r.status = 'accepted' or (r.status = 'pending' and r.to_attendee_id = ${attendeeId}::uuid))`)))
  return row?.n ?? 0
}

const WORDING: Record<string, string> = {
  not_attendee: 'Set up your event profile first.',
  not_open: 'Finding people is not open right now.',
  rate_limited: 'That is a lot of searches. Please wait a while and try again.',
  bad_tag: 'Type the tag number from their badge, for example F-042 or 42.',
  messaging_closed: 'Messaging is not open for this event right now.',
  not_available: 'This person is not taking message requests.',
  already_requested: 'You have already sent this person a request.',
  they_asked_you: 'They have already sent you a request. Answer it in Messages.',
  too_many_pending: 'You have 20 requests waiting for an answer. Wait for some replies first.',
  bad_message: 'Write a short message (up to 500 characters for a request, 1,000 for a reply).',
  report_reason: 'Please say briefly what happened, so ScanMe can review it.',
  report_failed: 'Your report could not be sent. You may have reached the limit of 20 reports at this event.',
}

/** The short code raised by one of the networking SQL functions, or 'error' for anything else. */
export function networkingErrorCode(error: unknown): string {
  const text = `${(error as Error)?.message ?? ''} ${(error as { cause?: { message?: string } })?.cause?.message ?? ''}`
  const code = Object.keys(WORDING).find((key) => text.includes(key))
  if (!code) console.error('[networking]', error)
  return code ?? 'error'
}

/** Only known codes become words, so a crafted ?e= link cannot put arbitrary text on the page. */
export const networkingWording = (code: string | undefined) =>
  code ? WORDING[code] ?? 'Something went wrong. Please try again.' : null
