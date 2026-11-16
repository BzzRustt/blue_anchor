import { sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { visitorDb } from '@/lib/db'
import { appBaseUrl } from '@/lib/event-queries'
import { signAttendeeToken } from '@/lib/attendee-token'
import { cookieName, cookieOptions, getJoinContext } from '@/lib/event-join'

/**
 * The target of the QR printed on a badge. Since M5 it is NOT a login: it opens that person's
 * public card for whoever scans it. The single exception is an unassigned spare walk-up tag,
 * which the first scan claims exactly once (claim_spare_tag) so a walk-up can fill it in.
 * Printed badges keep working because the URL is unchanged.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const safeSlug = encodeURIComponent(slug)
  const go = (path: string) => NextResponse.redirect(new URL(path, appBaseUrl()), 303)

  const ctx = await getJoinContext(slug)
  const attendeeId = z.uuid().safeParse(request.nextUrl.searchParams.get('a'))
  if (!ctx || !attendeeId.success) return go(`/e/${safeSlug}`)

  const result = await visitorDb.execute(sql`select claim_spare_tag(${ctx.eventId}::uuid, ${attendeeId.data}::uuid) as claimed`)
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Array<{ claimed: boolean }>
  if (rows[0]?.claimed) {
    const secret = process.env.SESSION_SECRET
    if (!secret) return new NextResponse(null, { status: 500 })
    const response = go(`/e/${safeSlug}/join`)
    response.cookies.set(cookieName(ctx.eventId), signAttendeeToken(attendeeId.data, ctx.expiresAt, secret), cookieOptions(ctx.expiresAt))
    return response
  }
  return go(`/e/${safeSlug}/a/${attendeeId.data}`)
}
