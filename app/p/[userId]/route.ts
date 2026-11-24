import { sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { visitorDb, withOwnerDb } from '@/lib/db'

type Row = { b64: string; updated_at: string }

/**
 * A profile photo. Public only while its owner's personal code is live (the database policy); the
 * owner can always see their own. Always the re-encoded WebP made by uploadPhoto, never the upload.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const id = decodeURIComponent(userId).slice(0, 100)
  const query = sql`select encode(bytes, 'base64') as b64, updated_at from user_photos where user_id = ${id}`
  const viewer = await auth.api.getSession({ headers: await headers() }).catch(() => null)
  const rows = viewer?.user.id === id
    ? await withOwnerDb(id, async (db) => (await db.execute<Row>(query)).rows)
    : ((r: unknown) => (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Row[])(await visitorDb.execute(query))
  const row = rows[0]
  if (!row) return new NextResponse(null, { status: 404 })
  return new NextResponse(new Uint8Array(Buffer.from(row.b64, 'base64')), {
    headers: {
      'content-type': 'image/webp',
      // The page adds ?v=<upload time>, so a new photo always gets a new address.
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  })
}
