import Link from 'next/link'
import { desc, eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { CalendarCheck, Plus, Ticket } from '@phosphor-icons/react/dist/ssr'
import { PageIntro } from '@/components/workspace/PageIntro'
import { schema, withOwnerDb } from '@/lib/db'
import { eventPhase, formatWhen } from '@/lib/events'
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
        capacity: schema.events.capacity,
        coverUrl: schema.events.coverUrl,
        endsAt: schema.events.endsAt,
        directoryExpiresAt: schema.events.directoryExpiresAt,
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
          : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{events.map((event) => {
            const phase = event.status === 'published' ? eventPhase(event.startsAt, event.endsAt, event.directoryExpiresAt) : null
            const pct = event.capacity ? Math.min(100, Math.round((event.attendees / event.capacity) * 100)) : 0
            const cta = event.status === 'draft' || event.status === 'awaiting_payment' ? 'Continue setup' : phase === 'Closed' ? 'View summary' : 'Manage event'
            const day = event.startsAt.toLocaleString('en-GB', { day: 'numeric', timeZone: 'Europe/London' })
            const month = event.startsAt.toLocaleString('en-GB', { month: 'short', timeZone: 'Europe/London' }).toUpperCase()
            return (
              <Link key={event.id} href={`/app/events/${event.id}`} className="soft-card flex min-h-48 flex-col overflow-hidden !p-0 transition hover:border-[var(--accent)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- already re-encoded and sized by the server */}
                {event.coverUrl && <img src={event.coverUrl} alt="" width={1280} height={640} className="aspect-[2/1] w-full object-cover" />}
                <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-center leading-none text-[var(--accent-strong)]"><span><span className="block text-[10px] font-extrabold tracking-[.1em]">{month}</span><span className="block text-xl font-extrabold">{day}</span></span></span>
                  {phase ? <span className="status-live">{phase}</span> : <span className="status-draft">{event.status === 'cancelled' ? 'Cancelled' : 'Draft'}</span>}
                </div>
                <h3 className="mt-4 text-xl font-extrabold tracking-[-.035em]">{event.name}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{formatWhen(event.startsAt)}{event.venue ? ` · ${event.venue}` : ''}</p>
                {event.capacity ? <div className="mt-4"><p className="mb-1 flex justify-between text-xs text-[var(--muted)]"><span>{event.attendees} / {event.capacity} guests</span><span>{pct}%</span></p><div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Places used" className="h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} /></div></div> : <p className="mt-4 text-xs text-[var(--muted)]">{event.attendees} {event.attendees === 1 ? 'tag' : 'tags'} issued</p>}
                <p className="mt-auto pt-5 text-xs font-bold text-[var(--accent-strong)]">{cta} →</p>
                </div>
              </Link>
            )
          })}</div>}
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-extrabold">Attending</h2>
        {attended.length === 0
          ? <p className="text-sm text-[var(--muted)]">Events you add to this account appear here, with a read-only copy of your conversations after the event. On an event page, choose “Add this event to my ScanMe account”.</p>
          : <div className="grid gap-3 md:grid-cols-2">{attended.map((a) => (
              <article key={a.event_id} className="soft-card flex flex-wrap items-center justify-between gap-3 p-4">
                <div><h3 className="font-extrabold">{a.name}</h3><p className="text-sm text-[var(--muted)]">{formatWhen(new Date(a.starts_at))} · tag <span className="font-mono">{a.tag}</span>{!a.is_open && ' · closed'}</p></div>
                <div className="flex gap-2">
                  {a.is_open && <Link href={`/e/${a.slug}`} className="action-secondary">Open</Link>}
                  <Link href={`/app/events/history/${a.event_id}`} className="action-quiet">Conversations</Link>
                </div>
              </article>
            ))}</div>}
      </section>
    </div>
  )
}
