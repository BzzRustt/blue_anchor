import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { schema, withAttendeeDb } from '@/lib/db'
import { signAttendeeToken } from '@/lib/attendee-token'
import { appBaseUrl } from '@/lib/event-queries'
import { cookieName, cookieOptions, getJoinContext } from '@/lib/event-join'

/**
 * The target of the QR printed on a badge.
 *
 * Pages cannot set cookies, so this exchanges the badge's attendee id for a signed cookie
 * and redirects to a clean URL — the id then leaves the address bar and browser history.
 * Whoever holds the badge QR can edit that card until the directory closes; that is the
 * accepted v1 trade-off (see the step 4 plan), bounded by the 48-hour window.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const home = (path: string) => NextResponse.redirect(new URL(path, appBaseUrl()), 303)

  const ctx = await getJoinContext(slug)
  const attendeeId = z.uuid().safeParse(request.nextUrl.searchParams.get('a'))
  if (!ctx || !attendeeId.success) return home(`/e/${encodeURIComponent(slug)}`)

  // The attendee must exist at *this* event. The self-read policy only returns the row when
  // the id we install as the claim is its own, so this cannot be used to probe other cards.
  const [found] = await withAttendeeDb(attendeeId.data, (tx) => tx
    .select({ id: schema.eventAttendees.id })
    .from(schema.eventAttendees)
    .where(and(eq(schema.eventAttendees.id, attendeeId.data), eq(schema.eventAttendees.eventId, ctx.eventId)))
    .limit(1))
  if (!found) return home(`/e/${encodeURIComponent(slug)}/join`)

  const secret = process.env.SESSION_SECRET
  if (!secret) return new NextResponse(null, { status: 500 })

  const response = home(`/e/${encodeURIComponent(slug)}/join`)
  response.cookies.set(cookieName(ctx.eventId), signAttendeeToken(found.id, ctx.expiresAt, secret), cookieOptions(ctx.expiresAt))
  return response
}
