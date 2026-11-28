import { eq, inArray } from 'drizzle-orm'
import { schema, withOwnerDb } from '@/lib/db'
import { requireOwner } from '@/lib/owner'

/**
 * "Download my data" (UK GDPR access and portability). Runs as the owner role, so RLS limits
 * every query to this account. Password hashes (account table) and session tokens are never
 * included. Attendee rows are included only for events this account organises.
 */
export async function GET() {
  const session = await requireOwner()
  const userId = session.user.id
  const data = await withOwnerDb(userId, async (db) => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId))
    const codes = await db.select().from(schema.codes).where(eq(schema.codes.userId, userId))
    const campaigns = await db.select().from(schema.campaigns).where(eq(schema.campaigns.userId, userId))
    const questions = campaigns.length ? await db.select().from(schema.questionBlocks).where(inArray(schema.questionBlocks.campaignId, campaigns.map((c) => c.id))) : []
    const responses = await db.select().from(schema.responses).where(eq(schema.responses.userId, userId))
    const events = await db.select().from(schema.events).where(eq(schema.events.userId, userId))
    const attendees = events.length ? await db.select().from(schema.eventAttendees).where(inArray(schema.eventAttendees.eventId, events.map((e) => e.id))) : []
    const purchases = await db.select().from(schema.eventPurchases).where(eq(schema.eventPurchases.userId, userId))
    return { exportedAt: new Date().toISOString(), user, codes, campaigns, questions, responses: responses.map(({ sessionToken: _sessionToken, deviceHash: _deviceHash, ...rest }) => rest), events, attendees: attendees.map(({ claimToken: _claimToken, ...rest }) => rest), purchases }
  })
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="scanme-data-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
