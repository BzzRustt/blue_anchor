import type { Metadata } from 'next'
import { sql } from 'drizzle-orm'
import { AttendeeNav } from '@/components/AttendeeNav'
import { EventClosed, EventShell } from '@/components/EventShell'
import { NetworkNotice } from '@/components/NetworkNotice'
import { PeopleList, SetUpFirst } from '@/components/PeopleList'
import { withAttendeeDb } from '@/lib/db'
import { formatWhen } from '@/lib/events'
import { attendeeSession, networkingErrorCode, networkingInfo, rowsOf, unreadCount, type FoundPerson } from '@/lib/networking'

export const metadata: Metadata = { title: 'Find people', robots: { index: false, follow: false } }

/** Badge search, and the full directory when the organiser chose it. Rules live in SQL. */
export default async function PeoplePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tag?: string }> }) {
  const { slug } = await params
  const { tag } = await searchParams
  const session = await attendeeSession(slug)
  if (!session) return <EventClosed />
  const { ctx, me } = session
  if (!me) return <SetUpFirst slug={slug} name={ctx.name} />

  const [net, unread] = await Promise.all([networkingInfo(ctx.eventId), unreadCount(me.id)])
  const open = net.discovery !== 'off' && (net.state === 'live' || net.state === 'follow_up')

  let found: FoundPerson[] = []
  let error: string | undefined
  if (open && tag?.trim()) {
    try {
      found = await withAttendeeDb(me.id, async (tx) => rowsOf<FoundPerson>(await tx.execute(sql`select * from attendee_find(${tag.slice(0, 20)})`)))
    } catch (e) { error = networkingErrorCode(e) }
  }
  const directory = open && net.discovery === 'directory'
    ? await withAttendeeDb(me.id, async (tx) => rowsOf<FoundPerson>(await tx.execute(sql`select * from attendee_directory()`))).catch(() => [])
    : []

  return (
    <EventShell eyebrow={ctx.name} title="Find people">
      <AttendeeNav slug={slug} active="people" unread={unread} />
      <NetworkNotice e={error} />
      {net.discovery === 'off' && <p className="text-sm leading-6 text-[var(--muted)]">The organiser has turned off finding people for this event. Scanning someone’s badge still shows their card.</p>}
      {net.discovery !== 'off' && net.state === 'before' && <p className="text-sm leading-6 text-[var(--muted)]">Finding people opens {formatWhen(net.opensAt)}.</p>}
      {open && (
        <div className="grid gap-5">
          <form className="grid gap-2" role="search">
            <label className="field-label">Tag on their badge<input className="field-input font-mono uppercase" name="tag" defaultValue={tag ?? ''} placeholder="F-042 or 42" maxLength={12} autoComplete="off" required /></label>
            <button className="action-primary w-full justify-center">Find</button>
          </form>
          {tag && !error && <PeopleList slug={slug} people={found} empty="Nobody with that tag is sharing a card." questions={ctx.questions} />}
          {net.discovery === 'directory' && (
            <section className="grid gap-3">
              <h2 className="font-extrabold">Everyone sharing a card ({directory.length})</h2>
              <PeopleList slug={slug} people={directory} empty="Nobody else is sharing a card yet." questions={ctx.questions} />
            </section>
          )}
        </div>
      )}
    </EventShell>
  )
}
