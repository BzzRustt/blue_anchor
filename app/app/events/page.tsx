import Link from 'next/link'
import { desc, eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { CalendarCheck, Plus, Ticket } from '@phosphor-icons/react/dist/ssr'
import { PageIntro } from '@/components/workspace/PageIntro'
import { schema, withOwnerDb } from '@/lib/db'
import { formatWhen } from '@/lib/events'
import { rowsOf } from '@/lib/networking'
import { requireOwner } from '@/lib/owner'

/** "Join an event": the event link is /e/<slug>, so a pasted link or bare code both work. */
async function joinEvent(formData: FormData) {
  'use server'
  const raw = String(formData.get('code') ?? '').trim().toLowerCase()
  const slug = raw.match(/\/e\/([a-z0-9-]{1,80})/)?.[1] ?? raw.replace(/[^a-z0-9-]/g, '').slice(0, 80)
  redirect(slug ? `/e/${slug}` : '/app/events')
}

interface Attended { event_id: string; slug: string; name: string; starts_at: string; tag: string; is_open: boolean }

export default async function EventsPage() {
  const session = await requireOwner()
  // Separate transactions: a failure in one must not abort the other.
  const [events, attended] = await Promise.all([
    withOwnerDb(session.user.id, (db) => db
      .select({
        id: schema.events.id,
        name: schema.events.name,
        venue: schema.events.venue,
        startsAt: schema.events.startsAt,
        status: schema.events.status,
        // `events.id` literally, not ${schema.events.id}: see the note in app/app/modes/page.tsx.
        attendees: sql<number>`(select count(*)::int from event_attendees a where a.event_id = events.id)`,
      })
      .from(schema.events)
      .where(eq(schema.events.userId, session.user.id))
      .orderBy(desc(schema.events.startsAt))),
    // ponytail: empty until the M8 database change is applied; the catch keeps the tab working before then.
    withOwnerDb(session.user.id, async (db) => rowsOf<Attended>(await db.execute(sql`select * from my_attended_events()`))).catch(() => [] as Attended[]),
  ])

  return (
    <div className="grid gap-7">
      <PageIntro eyebrow="Run a room" title="Events" body="Give every attendee a tag, so nobody at your event has to guess who to talk to." action={<Link href="/app/events/new" className="action-primary"><Plus size={18} weight="bold" />New event</Link>} />

      <form action={joinEvent} className="soft-card flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <label className="field-label flex-1">Join an event<input className="field-input" name="code" required maxLength={200} placeholder="Paste the event link or code" /></label>
        <button className="action-secondary"><Ticket size={18} />Open event</button>
      </form>

      <section className="grid gap-3">
        <h2 className="text-lg font-extrabold">Organising</h2>
        {events.length === 0
          ? <div className="soft-card grid place-items-center gap-3 p-10 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><CalendarCheck size={26} /></span><h3 className="text-xl font-extrabold">No events yet</h3><p className="max-w-md text-sm leading-6 text-[var(--muted)]">Create one for free, add your attendee list, and publish when you are ready.</p><Link href="/app/events/new" className="action-primary mt-2">Create your first event</Link></div>
          : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{events.map((event) => <Link key={event.id} href={`/app/events/${event.id}`} className="soft-card flex min-h-48 flex-col p-5 transition hover:border-[var(--accent)]"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><CalendarCheck size={22} /></span><h3 className="mt-6 text-xl font-extrabold tracking-[-.035em]">{event.name}</h3>{event.status !== 'published' && <span className="status-draft mt-2 w-fit">{event.status === 'cancelled' ? 'Cancelled' : 'Draft'}</span>}<p className="mt-2 text-sm text-[var(--muted)]">{formatWhen(event.startsAt)}{event.venue ? ` · ${event.venue}` : ''}</p><p className="mt-auto pt-5 text-xs font-bold text-[var(--accent-strong)]">{event.attendees} {event.attendees === 1 ? 'tag' : 'tags'} issued</p></Link>)}</div>}
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-extrabold">Attending</h2>
        {attended.length === 0
          ? <p className="text-sm text-[var(--muted)]">Events where you keep your card on this account appear here. On an event page, choose “Keep this card on my ScanMe account”.</p>
          : <div className="grid gap-3 md:grid-cols-2">{attended.map((a) => (
              <article key={a.event_id} className="soft-card flex items-center justify-between gap-3 p-4">
                <div><h3 className="font-extrabold">{a.name}</h3><p className="text-sm text-[var(--muted)]">{formatWhen(new Date(a.starts_at))} · tag <span className="font-mono">{a.tag}</span></p></div>
                {a.is_open ? <Link href={`/e/${a.slug}`} className="action-secondary">Open</Link> : <span className="text-xs font-bold text-[var(--faint)]">Closed</span>}
              </article>
            ))}</div>}
      </section>
    </div>
  )
}
