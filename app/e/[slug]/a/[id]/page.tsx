import type { Metadata } from 'next'
import Link from 'next/link'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr'
import { blockAttendee, reportAttendee, sendRequest, toggleSaved } from '@/app/e/[slug]/network-actions'
import { AttendeeNav } from '@/components/AttendeeNav'
import { ConfirmForm } from '@/components/ConfirmForm'
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
export default async function PublicCardPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ ok?: string; e?: string; from?: string }> }) {
  const { slug, id } = await params
  const query = await searchParams
  const ctx = await getJoinContext(slug)
  if (!ctx) return <EventClosed />

  const viewer = await verifiedAttendeeId(ctx.eventId)
  const isMe = viewer === id
  // Back to the list this card was opened from (same-event paths only), else Find people.
  const from = query.from && /^\/e\/[a-z0-9-]+\/(people|saved|messages)(\?[^#]*)?$/.test(query.from) && query.from.startsWith(`/e/${slug}/`) ? query.from : `/e/${slug}/people`

  const valid = z.uuid().safeParse(id).success
  // Someone who blocked you, or whom you blocked, can't open your card (scanning a badge included).
  const allowed = !valid || !viewer || isMe ? true : await withAttendeeDb(viewer, async (tx) => rowsOf<{ ok: boolean }>(await tx.execute(sql`select attendee_can_view(${id}::uuid) as ok`))).then((r) => r[0]?.ok !== false).catch(() => true)
  const [card] = valid && allowed
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
      {viewer && !isMe && <Link href={from} className="action-quiet mb-3 w-fit !px-0"><ArrowLeft size={18} />Back to results</Link>}
      <NetworkNotice ok={query.ok} e={query.e} />
      <div className="grid gap-4">
        {!card && <p className="text-sm leading-6 text-[var(--muted)]">{allowed ? 'This card has not been filled in yet, or it is not shared.' : 'This card is not available to you.'}</p>}
        {card && level === 'hidden' && <p className="text-sm leading-6 text-[var(--muted)]">This person has chosen not to share their card.</p>}
        {card && level !== 'hidden' && <BadgePlate tag={card.tag} name={card.displayName} label="Tag" />}
        {card && level === 'full' && (
          <dl className="grid gap-3">
            {ctx.questions.filter((q) => answers[q.id]).map((q) => (
              <div key={q.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <dt className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--faint)]">{q.label}</dt>
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
        {acting && (
          <details className="rounded-xl border border-[var(--line)] p-4 text-sm">
            <summary className="cursor-pointer font-bold text-[var(--muted)]">Block or report this person</summary>
            <p className="mt-2 leading-6 text-[var(--muted)]"><strong className="text-[var(--ink)]">Block</strong>: you stop seeing each other in search and on cards, and neither of you can message the other. They are not told. <strong className="text-[var(--ink)]">Report</strong>: tells ScanMe (not the organiser) about behaviour that breaks the rules.</p>
            <div className="mt-3 grid gap-3">
              <ConfirmForm action={blockAttendee} tone="danger" title={`Block ${card?.displayName ?? 'this person'}?`} message="You won't see each other in search or on cards, and neither of you can message the other at this event. They are not told. You can unblock them in Preferences." confirmLabel="Block" triggerLabel="Block" triggerClassName="action-secondary w-full justify-center"><input type="hidden" name="slug" value={slug} /><input type="hidden" name="back" value={here} /><input type="hidden" name="target" value={id} /></ConfirmForm>
              <form action={reportAttendee} className="grid gap-2">
                <input type="hidden" name="slug" value={slug} /><input type="hidden" name="back" value={here} /><input type="hidden" name="target" value={id} />
                <label className="field-label">What happened?<textarea className="field-textarea min-h-20" name="reason" required maxLength={500} placeholder="A short description helps ScanMe review it." /></label>
                <button className="action-quiet w-full justify-center">Send report</button>
              </form>
            </div>
          </details>
        )}
        {isMe
          ? <Link href={`/e/${slug}`} className="action-primary w-full justify-center">This is your card · manage it</Link>
          : <Link href={`/e/${slug}`} className="action-secondary w-full justify-center">About this event</Link>}
      </div>
    </EventShell>
  )
}
