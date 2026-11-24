import type { Metadata } from 'next'
import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr'
import { blockAttendee, reportAttendee, sendMessage } from '@/app/e/[slug]/network-actions'
import { AttendeeNav } from '@/components/AttendeeNav'
import { ConfirmForm } from '@/components/ConfirmForm'
import { EventClosed, EventShell } from '@/components/EventShell'
import { NetworkNotice } from '@/components/NetworkNotice'
import { SetUpFirst } from '@/components/PeopleList'
import { withAttendeeDb } from '@/lib/db'
import { formatWhen } from '@/lib/events'
import { attendeeSession, networkingInfo, rowsOf, unreadCount } from '@/lib/networking'

export const metadata: Metadata = { title: 'Conversation', robots: { index: false, follow: false } }

/** One conversation. Readable only by its two participants (RLS); opening it marks it read. */
export default async function ThreadPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ ok?: string; e?: string }> }) {
  const { slug, id } = await params
  const query = await searchParams
  const session = await attendeeSession(slug)
  if (!session) return <EventClosed />
  const { ctx, me } = session
  if (!me) return <SetUpFirst slug={slug} name={ctx.name} />
  if (!z.uuid().safeParse(id).success) return <EventShell eyebrow={ctx.name} title="Conversation not found" />

  const { request, messages } = await withAttendeeDb(me.id, async (tx) => {
    const [request] = rowsOf<{ status: string; other_id: string; other_name: string | null; other_tag: string | null }>(await tx.execute(sql`
      select r.status, o.id as other_id, o.display_name as other_name, o.tag as other_tag
      from message_requests r
      left join event_attendees o on o.id = case when r.from_attendee_id = ${me.id}::uuid then r.to_attendee_id else r.from_attendee_id end
      where r.id = ${id}::uuid`))
    if (!request) return { request: null, messages: [] }
    await tx.execute(sql`select messages_mark_read(${id}::uuid)`)
    const messages = rowsOf<{ id: string; mine: boolean; body: string; created_at: string }>(await tx.execute(sql`
      select id, from_attendee_id = ${me.id}::uuid as mine, body, created_at from event_messages where request_id = ${id}::uuid order by created_at`))
    return { request, messages }
  })
  if (!request) return <EventShell eyebrow={ctx.name} title="Conversation not found"><Link href={`/e/${slug}/messages`} className="action-secondary w-full justify-center">Back to messages</Link></EventShell>

  const [net, unread] = await Promise.all([networkingInfo(ctx.eventId), unreadCount(me.id)])
  const canReply = request.status === 'accepted' && net.repliesOpen
  const here = `/e/${slug}/messages/${id}`
  const hidden = (<><input type="hidden" name="slug" value={slug} /><input type="hidden" name="back" value={here} /><input type="hidden" name="request" value={id} /><input type="hidden" name="target" value={request.other_id} /></>)

  return (
    <EventShell eyebrow={ctx.name} title={request.other_name ?? 'Conversation'} subtitle={request.other_tag ?? undefined}>
      <AttendeeNav slug={slug} active="messages" unread={unread} />
      <Link href={`/e/${slug}/messages`} className="action-quiet mb-3 w-fit !px-0"><ArrowLeft size={18} />All messages</Link>
      <NetworkNotice ok={query.ok} e={query.e} />
      <ol className="grid gap-2" aria-label="Messages">
        {messages.map((m) => (
          <li key={m.id} className={`max-w-[85%] rounded-2xl p-3 text-sm leading-6 ${m.mine ? 'justify-self-end bg-[var(--accent)] text-[var(--on-accent)]' : 'justify-self-start border border-[var(--line)] bg-[var(--surface)]'}`}>
            <span className="sr-only">{m.mine ? 'You' : request.other_name}: </span>
            <span className="whitespace-pre-line">{m.body}</span>
            <span className="mt-1 block text-[10px] opacity-70">{formatWhen(new Date(m.created_at))}</span>
          </li>
        ))}
      </ol>

      {request.status === 'pending' && <p className="mt-4 text-sm text-[var(--muted)]">Waiting for them to accept your request.</p>}
      {request.status === 'accepted' && !canReply && <p className="mt-4 text-sm text-[var(--muted)]">This conversation is closed for new messages.</p>}
      {canReply && (
        <form action={sendMessage} className="mt-4 grid gap-2">
          {hidden}
          <label className="field-label">Reply<textarea className="field-input min-h-24" name="body" required maxLength={1000} /></label>
          <p className="text-xs text-[var(--muted)]">Want to stay in touch after the event? Share your email or LinkedIn here only if you choose to.</p>
          <button className="action-primary w-full justify-center">Send</button>
        </form>
      )}

      <details className="mt-6 rounded-xl border border-[var(--line)] p-4 text-sm">
        <summary className="cursor-pointer font-bold">Block or report</summary>
        <p className="mt-2 leading-6 text-[var(--muted)]"><strong className="text-[var(--ink)]">Block</strong> ends this conversation and hides you from each other in search and on cards. They are not told. <strong className="text-[var(--ink)]">Report</strong> sends what happened to ScanMe for review.</p>
        <div className="mt-3"><ConfirmForm action={blockAttendee} tone="danger" title={`Block ${request.other_name ?? 'this person'}?`} message="This conversation ends, and you won't see each other in search or on cards at this event. They are not told. You can unblock them from the event page." confirmLabel="Block" triggerLabel={`Block ${request.other_name ?? 'this person'}`} triggerClassName="font-bold text-[var(--danger)] underline">{hidden}</ConfirmForm></div>
        <form action={reportAttendee} className="mt-3 grid gap-2">
          {hidden}
          <label className="field-label">What happened?<textarea className="field-input" name="reason" required maxLength={500} /></label>
          <button className="action-secondary w-full justify-center">Report to ScanMe</button>
          <p className="text-xs text-[var(--muted)]">Reports go to ScanMe, not to the organiser or the other person.</p>
        </form>
      </details>
    </EventShell>
  )
}
