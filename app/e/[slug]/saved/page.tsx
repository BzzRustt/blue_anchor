import type { Metadata } from 'next'
import { sql } from 'drizzle-orm'
import { AttendeeNav } from '@/components/AttendeeNav'
import { EventClosed, EventShell } from '@/components/EventShell'
import { NetworkNotice } from '@/components/NetworkNotice'
import { PeopleList, SetUpFirst } from '@/components/PeopleList'
import { withAttendeeDb } from '@/lib/db'
import { attendeeSession, rowsOf, unreadCount, type FoundPerson } from '@/lib/networking'

export const metadata: Metadata = { title: 'Saved people', robots: { index: false, follow: false } }

/** Private list. Nobody is told they were saved; people who hide their card drop out of it. */
export default async function SavedPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; e?: string }> }) {
  const { slug } = await params
  const query = await searchParams
  const session = await attendeeSession(slug)
  if (!session) return <EventClosed />
  const { ctx, me } = session
  if (!me) return <SetUpFirst slug={slug} name={ctx.name} />

  const [people, unread] = await Promise.all([
    withAttendeeDb(me.id, async (tx) => rowsOf<FoundPerson>(await tx.execute(sql`
      select a.id, a.tag, a.display_name, case when a.profile_visibility = 'full' then a.answers else '{}'::jsonb end as answers
      from saved_attendees s join event_attendees a on a.id = s.saved_attendee_id
      where s.attendee_id = ${me.id}::uuid and a.profile_visibility <> 'hidden'
      order by s.created_at desc`))),
    unreadCount(me.id),
  ])

  return (
    <EventShell eyebrow={ctx.name} title="Saved people">
      <AttendeeNav slug={slug} active="saved" unread={unread} />
      <NetworkNotice ok={query.ok} e={query.e} />
      <p className="mb-3 text-sm leading-6 text-[var(--muted)]">Only you can see this list. Save someone from their card.</p>
      <PeopleList slug={slug} people={people} empty="You have not saved anyone yet." questions={ctx.questions} />
    </EventShell>
  )
}
