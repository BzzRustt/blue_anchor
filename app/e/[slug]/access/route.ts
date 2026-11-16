import { sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { visitorDb } from '@/lib/db'
import { signAttendeeToken } from '@/lib/attendee-token'
import { appBaseUrl } from '@/lib/event-queries'
import { clientKey, cookieName, cookieOptions, getJoinContext, joinLimiter } from '@/lib/event-join'

/**
 * A personal access link (organiser-issued or emailed). Swaps the token for the attendee cookie
 * on this device and redirects to a clean URL, so the token leaves the address bar.
 * Invalid, revoked and expired links all land on the same "link not valid" notice.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const safeSlug = encodeURIComponent(slug)
  const go = (path: string) => NextResponse.redirect(new URL(path, appBaseUrl()), 303)

  const ctx = await getJoinContext(slug)
  const token = request.nextUrl.searchParams.get('t') ?? ''
  if (!ctx) return go(`/e/${safeSlug}`)
  if (!/^[0-9a-f]{64}$/.test(token)) return go(`/e/${safeSlug}?access=invalid`)

  const key = await clientKey(ctx.eventId)
  if (joinLimiter.isLimited(key)) return go(`/e/${safeSlug}?access=invalid`)
  joinLimiter.increment(key)

  const result = await visitorDb.execute(sql`select redeem_attendee_access(${slug}::text, ${token}::text) as attendee_id`)
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Array<{ attendee_id: string | null }>
  const attendeeId = rows[0]?.attendee_id
  if (!attendeeId) return go(`/e/${safeSlug}?access=invalid`)

  const secret = process.env.SESSION_SECRET
  if (!secret) return new NextResponse(null, { status: 500 })
  const response = go(`/e/${safeSlug}?access=ok`)
  response.cookies.set(cookieName(ctx.eventId), signAttendeeToken(attendeeId, ctx.expiresAt, secret), cookieOptions(ctx.expiresAt))
  return response
}
