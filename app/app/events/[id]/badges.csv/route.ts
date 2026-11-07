import { headers } from 'next/headers'
import { auth } from '@/lib/auth-server'
import { getOwnedEvent, joinUrl } from '@/lib/event-queries'
import { badgesCsv } from '@/lib/events'

/**
 * Badge export for the print shop. Ungated on every plan: it is how an organiser gets a
 * physical badge made, and a free event that cannot be printed is not a usable event.
 * (The paid export is the post-event report, which is a different artefact.)
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return new Response(null, { status: 401 })

  const { id } = await params
  const found = await getOwnedEvent(session.user.id, id)
  if (!found) return new Response(null, { status: 404 })

  const label = new Map(found.roles.map((role) => [role.letter, role.label]))
  const csv = badgesCsv(
    found.attendees.map((a) => ({
      tag: a.tag,
      name: a.source === 'walk_up' ? '' : a.displayName,
      role: a.roleLetter ? label.get(a.roleLetter) ?? a.roleLetter : '',
      joinUrl: joinUrl(found.slug, a.id),
    })),
    found.event.accessCode
  )

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${found.slug}-badges.csv"`,
      'cache-control': 'private, no-store',
    },
  })
}
