import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { schema, withOwnerDb } from '@/lib/db'
import type { Role } from '@/lib/events'

const uuid = z.uuid()

export const appBaseUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/**
 * An event, only if it belongs to this organiser. Returns null for a malformed id, an
 * unknown id and someone else's event alike, so callers cannot tell the cases apart.
 */
export async function getOwnedEvent(userId: string, id: string) {
  if (!uuid.safeParse(id).success) return null
  return withOwnerDb(userId, async (db) => {
    const [row] = await db
      .select({ event: schema.events, slug: schema.codes.slug, isLive: schema.codes.isLive })
      .from(schema.events)
      .innerJoin(schema.codes, eq(schema.codes.id, schema.events.codeId))
      .where(and(eq(schema.events.id, id), eq(schema.events.userId, userId)))
      .limit(1)
    if (!row) return null

    const attendees = await db
      .select()
      .from(schema.eventAttendees)
      .where(eq(schema.eventAttendees.eventId, row.event.id))
      .orderBy(asc(schema.eventAttendees.roleLetter), asc(schema.eventAttendees.tag))

    return { ...row, attendees, roles: (row.event.roleSet as Role[]) ?? [] }
  })
}

/** The URL printed on a badge's QR. The attendee id is an unguessable capability. */
export const joinUrl = (slug: string, attendeeId: string) => `${appBaseUrl()}/e/${slug}/join?a=${attendeeId}`
