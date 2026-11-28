import { sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { visitorDb, withOwnerDb } from '@/lib/db'

type Row = { b64: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * An event cover photo. Public only while the event is published (the database policy); the organiser
 * can always see their own. Always the re-encoded WebP made by uploadEventCover, never the upload.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  if (!UUID.test(eventId)) return new NextResponse(null, { status: 404 })
  const query = sql`select encode(bytes, 'base64') as b64 from event_covers where event_id = ${eventId}::uuid`
  const viewer = await auth.api.getSession({ headers: await headers() }).catch(() => null)
  const asOwner = viewer ? await withOwnerDb(viewer.user.id, async (db) => (await db.execute<Row>(query)).rows).catch(() => [] as Row[]) : []
  const rows = asOwner.length ? asOwner : ((r: unknown) => (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Row[])(await visitorDb.execute(query))
  const row = rows[0]
  if (!row) return new NextResponse(null, { status: 404 })
  return new NextResponse(new Uint8Array(Buffer.from(row.b64, 'base64')), {
    headers: {
      'content-type': 'image/webp',
      // The pages add ?v=<upload time>, so a new cover always gets a new address.
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  })
}
