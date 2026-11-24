import QRCode from 'qrcode'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { schema, withOwnerDb } from '@/lib/db'
import { getOwnerSession } from '@/lib/owner'
import { appBaseUrl } from '@/lib/event-queries'

/**
 * The owner's personal QR as a PNG. Made only when "Show QR" is opened (it used to be rendered into
 * every Home load). The page adds ?v=<code> so a changed code never shows a cached old image.
 */
export async function GET() {
  const session = await getOwnerSession()
  if (!session) return new NextResponse(null, { status: 401 })
  const [code] = await withOwnerDb(session.user.id, (db) => db.select({ slug: schema.codes.slug }).from(schema.codes)
    .where(and(eq(schema.codes.userId, session.user.id), eq(schema.codes.kind, 'personal'))).limit(1))
  if (!code) return new NextResponse(null, { status: 404 })
  const png = await QRCode.toBuffer(`${appBaseUrl()}/t/${code.slug}`, { width: 720, margin: 2, color: { dark: '#10251a', light: '#ffffff' } })
  return new NextResponse(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=86400', 'content-disposition': `inline; filename="scanme-${code.slug}.png"` } })
}
