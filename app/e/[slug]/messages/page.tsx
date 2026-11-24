import type { Metadata } from 'next'
import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { respondRequest } from '@/app/e/[slug]/network-actions'
import { AttendeeNav } from '@/components/AttendeeNav'
import { EventClosed, EventShell } from '@/components/EventShell'
import { NetworkNotice } from '@/components/NetworkNotice'
import { SetUpFirst } from '@/components/PeopleList'
import { withAttendeeDb } from '@/lib/db'
import { formatWhen } from '@/lib/events'
import { attendeeSession, networkingInfo, rowsOf, unreadCount } from '@/lib/networking'

export const metadata: Metadata = { title: 'Messages', robots: { index: false, follow: false } }

interface Row { id: string; status: string; incoming: boolean; other_id: string; other_name: string | null; other_tag: string | null; first_body: string | null; unread: number }

/** Requests for me, my conversations, and requests I am waiting on. Organisers never see these. */
export default async function MessagesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; e?: string }> }) {
  const { slug } = await params
  const query = await searchParams
  const session = await attendeeSession(slug)
  if (!session) return <EventClosed />
  const { ctx, me } = session
  if (!me) return <SetUpFirst slug={slug} name={ctx.name} />

  const [rows, unread, net] = await Promise.all([
    withAttendeeDb(me.id, async (tx) => rowsOf<Row>(await tx.execute(sql`
      select r.id, r.status, r.to_attendee_id = ${me.id}::uuid as incoming,
             o.id as other_id, o.display_name as other_name, o.tag as other_tag,
             (select m.body from event_messages m where m.request_id = r.id order by m.created_at limit 1) as first_body,
             (select count(*)::int from event_messages m where m.request_id = r.id and m.read_at is null and m.from_attendee_id <> ${me.id}::uuid) as unread
      from message_requests r
      left join event_attendees o on o.id = case when r.from_attendee_id = ${me.id}::uuid then r.to_attendee_id else r.from_attendee_id end
      order by r.created_at desc`))),
    unreadCount(me.id),
    networkingInfo(ctx.eventId),
  ])
  const incoming = rows.filter((r) => r.incoming && r.status === 'pending')
  const talking = rows.filter((r) => r.status === 'accepted')
  const waiting = rows.filter((r) => !r.incoming && r.status !== 'accepted')
  const back = `/e/${slug}/messages`

  return (
    <EventShell eyebrow={ctx.name} title="Messages">
      <AttendeeNav slug={slug} active="messages" unread={unread} />
      <NetworkNotice ok={query.ok} e={query.e} />
      {!net.messaging && <p className="mb-4 text-sm leading-6 text-[var(--muted)]">The organiser has not turned on messages for this event.</p>}
      {net.messaging && net.state === 'follow_up' && <p className="mb-4 text-sm leading-6 text-[var(--muted)]">The event has ended. You can reply in accepted conversations until {formatWhen(net.repliesUntil)}; new requests are closed.</p>}
      {net.messaging && (net.state === 'live' || net.state === 'follow_up') && <KeepNotice slug={slug} until={formatWhen(net.repliesUntil)} />}

      <div className="grid gap-6">
        <section className="grid gap-2">
          <h2 className="font-extrabold">Requests for you</h2>
          {!incoming.length && <p className="text-sm text-[var(--muted)]">No new requests.</p>}
          {incoming.map((r) => (
            <article key={r.id} className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <p className="text-sm"><Link className="font-bold underline" href={`/e/${slug}/a/${r.other_id}?from=${encodeURIComponent(back)}`}>{r.other_name ?? 'An attendee'}</Link> <span className="font-mono text-xs text-[var(--muted)]">{r.other_tag}</span></p>
              {r.first_body && <p className="whitespace-pre-line text-sm leading-6">{r.first_body}</p>}
              <form action={respondRequest} className="flex flex-wrap gap-2">
                <input type="hidden" name="slug" value={slug} /><input type="hidden" name="back" value={back} /><input type="hidden" name="request" value={r.id} />
                <button name="action" value="accept" className="action-primary">Accept</button>
                <button name="action" value="decline" className="action-secondary">Decline</button>
                <button name="action" value="block" className="text-sm font-bold text-[var(--danger)] underline">Block</button>
              </form>
            </article>
          ))}
        </section>

        <section className="grid gap-2">
          <h2 className="font-extrabold">Conversations</h2>
          {!talking.length && <p className="text-sm text-[var(--muted)]">None yet. Find someone and send a request from their card.</p>}
          {talking.map((r) => (
            <Link key={r.id} href={`/e/${slug}/messages/${r.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 hover:border-[var(--accent)]">
              <span className="font-bold">{r.other_name ?? 'An attendee'} <span className="font-mono text-xs font-normal text-[var(--muted)]">{r.other_tag}</span></span>
              {r.unread > 0 && <span className="rounded-full bg-[var(--lime)] px-2 text-xs font-extrabold text-[var(--on-lime)]">{r.unread} new</span>}
            </Link>
          ))}
        </section>

        {waiting.length > 0 && (
          <section className="grid gap-2">
            <h2 className="font-extrabold">Sent by you</h2>
            {waiting.map((r) => (
              <p key={r.id} className="flex justify-between rounded-xl border border-[var(--line)] p-3 text-sm">
                <span>{r.other_name ?? 'An attendee'}</span>
                <span className="text-[var(--muted)]">{r.status === 'pending' ? 'Waiting for a reply' : 'Not accepted'}</span>
              </p>
            ))}
          </section>
        )}
      </div>
    </EventShell>
  )
}

/** During and just after the event: when messages close, and how to keep a copy (a linked ScanMe account). */
function KeepNotice({ slug, until }: { slug: string; until: string }) {
  return (
    <div className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm leading-6">
      <p><strong>Messages close {until}</strong>, 48 hours after the event ends. Swap contact details in a conversation if you want to stay in touch.</p>
      <p className="mt-1 text-[var(--muted)]">Want a read-only copy after that? <Link className="font-bold text-[var(--accent)] underline" href={`/e/${slug}#keep`}>Add this event to your free ScanMe account</Link>. Accounts keep a read-only copy of their conversations.</p>
    </div>
  )
}
