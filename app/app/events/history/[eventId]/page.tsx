import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr'
import { withOwnerDb } from '@/lib/db'
import { formatWhen } from '@/lib/events'
import { rowsOf } from '@/lib/networking'
import { requireOwner } from '@/lib/owner'

type Kept = { request_id: string; other_name: string; other_tag: string; messages: Array<{ mine: boolean; body: string; at: string }> }
type Attended = { event_id: string; name: string; starts_at: string; tag: string }

/**
 * A read-only copy of your conversations at an event you added to your account. Nothing can be sent
 * from here. Kept until the data is deleted under the retention period.
 */
export default async function KeptConversations({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  if (!z.uuid().safeParse(eventId).success) notFound()
  const session = await requireOwner()
  const [event, conversations] = await withOwnerDb(session.user.id, async (db) => [
    rowsOf<Attended>(await db.execute(sql`select event_id, name, starts_at, tag from my_attended_events() where event_id = ${eventId}::uuid`))[0],
    rowsOf<Kept>(await db.execute(sql`select * from my_kept_conversations(${eventId}::uuid)`)),
  ] as const)
  if (!event) notFound()

  return (
    <div className="grid gap-6">
      <Link href="/app/events" className="action-quiet w-fit !px-0"><ArrowLeft size={18} />Events</Link>
      <header>
        <p className="overline">Attended · read-only</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-.05em]">{event.name}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{formatWhen(new Date(event.starts_at))} · your tag <span className="font-mono">{event.tag}</span>. Your accepted conversations, kept on your account. You can’t send new messages here.</p>
      </header>
      {conversations.length === 0
        ? <p className="soft-card p-6 text-sm text-[var(--muted)]">No accepted conversations at this event.</p>
        : conversations.map((c) => (
          <section key={c.request_id} className="soft-card grid gap-3 p-5">
            <h2 className="font-extrabold">{c.other_name} <span className="font-mono text-xs font-normal text-[var(--muted)]">{c.other_tag}</span></h2>
            <ol className="grid gap-2">
              {c.messages.map((m, i) => (
                <li key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-6 ${m.mine ? 'justify-self-end bg-[var(--accent-soft)]' : 'justify-self-start bg-[var(--surface-muted)]'}`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{m.mine ? 'You' : c.other_name} · {formatWhen(new Date(m.at))}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
    </div>
  )
}
