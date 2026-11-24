import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { visitorDb } from '@/lib/db'
import { appBaseUrl } from '@/lib/event-queries'

/**
 * scanme.app/@nickname (rewritten here by next.config). Sends the visitor to the owner's personal
 * page. The database refuses while the owner's live Mode is Incognito, so a nickname can never
 * reveal whose anonymous page it is; that case looks exactly like an unknown nickname.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const clean = decodeURIComponent(handle).toLowerCase()
  if (!/^[a-z0-9._]{3,20}$/.test(clean)) return NextResponse.redirect(new URL('/_404', appBaseUrl()), 307)
  const result = await visitorDb.execute(sql`select code_for_handle(${clean}) as slug`)
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Array<{ slug: string | null }>
  const slug = rows[0]?.slug
  return NextResponse.redirect(new URL(slug ? `/t/${encodeURIComponent(slug)}` : '/_404', appBaseUrl()), 307)
}
