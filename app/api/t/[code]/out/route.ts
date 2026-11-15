import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from 'drizzle-orm'
import { visitorDb } from '@/lib/db'
import { visitorLinks } from '@/lib/modes'
import { getVisitorExperience, modeKey } from '@/lib/product'
import { verifySessionToken } from '@/lib/session-token'

/**
 * Outbound link redirect. The visitor page links here with a position (?i=2); the destination is
 * looked up on the server from the owner's saved Mode, never taken from the request, so this cannot
 * be used as an open redirect. Each click is counted when the visitor has a valid guest cookie.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const experience = await getVisitorExperience(code)
  if (!experience) return new NextResponse('Not found', { status: 404 })

  const index = Number(request.nextUrl.searchParams.get('i'))
  const links = visitorLinks(modeKey(experience.campaign.mode), experience.config, experience.owner)
  const link = Number.isInteger(index) ? links[index] : undefined
  if (!link) return new NextResponse('Not found', { status: 404 })

  const secret = process.env.SESSION_SECRET
  const token = (await cookies()).get('scanme_guest')?.value
  if (secret && token && verifySessionToken(token, secret) !== null) {
    // Raw insert of granted columns only (see the scan route); a failed count must never block the redirect.
    await visitorDb.execute(sql`insert into link_clicks (code_id, campaign_id, target, session_token) values (${experience.code.id}, ${experience.campaign.id}, ${link.key}, ${token})`).catch(() => {})
  }
  return NextResponse.redirect(link.url, 302)
}
