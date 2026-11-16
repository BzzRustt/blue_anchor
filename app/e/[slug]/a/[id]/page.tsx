import type { Metadata } from 'next'
import Link from 'next/link'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { sendRequest, toggleSaved } from '@/app/e/[slug]/network-actions'
import { AttendeeNav } from '@/components/AttendeeNav'
import { BadgePlate } from '@/components/BadgePlate'
import { NetworkNotice } from '@/components/NetworkNotice'
import { EventClosed, EventShell } from '@/components/EventShell'
import { asVisibility } from '@/lib/attendee-access'
import { schema, visitorDb, withAttendeeDb } from '@/lib/db'
import { getJoinContext, loadMyCard, verifiedAttendeeId } from '@/lib/event-join'
import { networkingInfo, rowsOf, unreadCount } from '@/lib/networking'

export const metadata: Metadata = { title: { absolute: 'ScanMe' }, robots: { index: false, follow: false } }

/**
 * Someone's public event card: what scanning their badge shows. Read as visitor_user, so RLS
 * only returns completed cards while the event is open; the attendee's own visibility choice
 * (full / name only / hidden) decides what is rendered. Email is never selectable here.
 */
export default async function PublicCardPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ ok?: string; e?: string }> }) {
  const { slug, id } = await params
  const query = await searchParams
  const ctx = await getJoinContext(slug)
  if (!ctx) return <EventClosed />

  const viewer = await verifiedAttendeeId(ctx.eventId)
  const isMe = viewer === id

  const valid = z.uuid().safeParse(id).success
  const [card] = valid
    ? await visitorDb
        .select({
          tag: schema.eventAttendees.tag,
          roleLetter: schema.eventAttendees.roleLetter,
          displayName: schema.eventAttendees.displayName,
          answers: schema.eventAttendees.answers,
          visibility: schema.eventAttendees.profileVisibility,
          allowMessages: schema.eventAttendees.allowMessages,
        })
        .from(schema.eventAttendees)
        .where(and(eq(schema.eventAttendees.id, id), eq(schema.eventAttendees.eventId, ctx.eventId), eq(schema.eventAttendees.status, 'complete')))
        .limit(1)
    : []

  const level = card ? asVisibility(card.visibility) : 'hidden'
  const role = card?.roleLetter ? ctx.roles.find((r) => r.letter === card.roleLetter)?.label : undefined
  const answers = (card?.answers ?? {}) as Record<string, string>

  // A signed-in attendee looking at someone else's shared card can save it or send a request.
  const myCard = viewer && !isMe ? await loadMyCard(viewer, ctx.eventId) : null
  const acting = myCard && myCard.status !== 'withdrawn' && card && level !== 'hidden' ? myCard : null
  const [net, unread, rel] = acting
    ? await Promise.all([
        networkingInfo(ctx.eventId),
        unreadCount(acting.id),
        withAttendeeDb(acting.id, async (tx) => rowsOf<{ saved: boolean; requested: boolean }>(await tx.execute(sql`
          select exists (select 1 from saved_attendees where attendee_id = ${acting.id}::uuid and saved_attendee_id = ${id}::uuid) as saved,
                 exists (select 1 from message_requests where ${acting.id}::uuid in (from_attendee_id, to_attendee_id) and ${id}::uuid in (from_attendee_id, to_attendee_id)) as requested`))),
      ])
    : [null, 0, []]
  const here = `/e/${slug}/a/${id}`
  const canRequest = acting && net?.messaging && net.state === 'live' && card?.allowMessages && acting.status === 'complete' && !rel[0]?.requested

  return (
    <EventShell eyebrow={ctx.name} title={card && level !== 'hidden' ? card.displayName : 'Event card'} subtitle={role}>
      {acting && <AttendeeNav slug={slug} active="people" unread={unread} />}
      <NetworkNotice ok={query.ok} e={query.e} />
      <div className="grid gap-4">
        {!card && <p className="text-sm leading-6 text-[var(--muted)]">This card has not been filled in yet, or it is not shared.</p>}
        {card && level === 'hidden' && <p className="text-sm leading-6 text-[var(--muted)]">This person has chosen not to share their card.</p>}
        {card && level !== 'hidden' && <BadgePlate tag={card.tag} name={card.displayName} label="Tag" />}
        {card && level === 'full' && (
          <dl className="grid gap-3">
            {ctx.questions.filter((q) => answers[q.id]).map((q) => (
              <div key={q.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <dt className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--faint)]">{q.prompt}</dt>
                <dd className="mt-1 whitespace-pre-line text-sm leading-6">{answers[q.id]}</dd>
              </div>
            ))}
          </dl>
        )}
        {acting && (
          <form action={toggleSaved}>
            <input type="hidden" name="slug" value={slug} /><input type="hidden" name="back" value={here} /><input type="hidden" name="target" value={id} /><input type="hidden" name="saved" value={rel[0]?.saved ? '1' : '0'} />
            <button className="action-secondary w-full justify-center">{rel[0]?.saved ? 'Saved · remove' : 'Save this person'}</button>
          </form>
        )}
        {canRequest && (
          <form action={sendRequest} className="grid gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <input type="hidden" name="slug" value={slug} /><input type="hidden" name="back" value={here} /><input type="hidden" name="target" value={id} />
            <label className="field-label">Send a message request<textarea className="field-input min-h-20" name="body" required maxLength={500} placeholder="Say who you are and why you would like to talk." /></label>
            <button className="action-primary w-full justify-center">Send request</button>
            <p className="text-xs text-[var(--muted)]">They can accept, decline or block. The organiser cannot read your messages.</p>
          </form>
        )}
        {acting && rel[0]?.requested && <Link href={`/e/${slug}/messages`} className="action-secondary w-full justify-center">Open messages</Link>}
        {isMe
          ? <Link href={`/e/${slug}`} className="action-primary w-full justify-center">This is your card · manage it</Link>
          : <Link href={`/e/${slug}`} className="action-secondary w-full justify-center">About this event</Link>}
      </div>
    </EventShell>
  )
}
