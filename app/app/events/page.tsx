import Link from 'next/link'
import { desc, eq, sql } from 'drizzle-orm'
import { CalendarCheck, Plus } from '@phosphor-icons/react/dist/ssr'
import { PageIntro } from '@/components/workspace/PageIntro'
import { schema, withOwnerDb } from '@/lib/db'
import { formatWhen } from '@/lib/events'
import { requireOwner } from '@/lib/owner'

export default async function EventsPage() {
  const session = await requireOwner()
  const events = await withOwnerDb(session.user.id, (db) => db
    .select({
      id: schema.events.id,
      name: schema.events.name,
      venue: schema.events.venue,
      startsAt: schema.events.startsAt,
      // `events.id` literally, not ${schema.events.id}: see the note in app/app/campaigns/page.tsx.
      attendees: sql<number>`(select count(*)::int from event_attendees a where a.event_id = events.id)`,
    })
    .from(schema.events)
    .where(eq(schema.events.userId, session.user.id))
    .orderBy(desc(schema.events.startsAt)))

  return (
    <div className="grid gap-7">
      <PageIntro eyebrow="Run a room" title="Events" body="Give every attendee a tag, so nobody at your event has to guess who to talk to." action={<Link href="/app/events/new" className="action-primary"><Plus size={18} weight="bold" />New event</Link>} />
      {events.length === 0
        ? <section className="soft-card grid place-items-center gap-3 p-10 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><CalendarCheck size={26} /></span><h2 className="text-xl font-extrabold">No events yet</h2><p className="max-w-md text-sm leading-6 text-[var(--muted)]">Create one, add your attendee list, and export badges that carry each person&apos;s tag.</p><Link href="/app/events/new" className="action-primary mt-2">Create your first event</Link></section>
        : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{events.map((event) => <Link key={event.id} href={`/app/events/${event.id}`} className="soft-card flex min-h-48 flex-col p-5 transition hover:border-[var(--accent)]"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><CalendarCheck size={22} /></span><h2 className="mt-6 text-xl font-extrabold tracking-[-.035em]">{event.name}</h2><p className="mt-2 text-sm text-[var(--muted)]">{formatWhen(event.startsAt)}{event.venue ? ` · ${event.venue}` : ''}</p><p className="mt-auto pt-5 text-xs font-bold text-[var(--accent-strong)]">{event.attendees} {event.attendees === 1 ? 'tag' : 'tags'} issued</p></Link>)}</section>}
    </div>
  )
}
