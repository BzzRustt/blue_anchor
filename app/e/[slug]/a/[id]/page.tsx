import type { Metadata } from 'next'
import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { BadgePlate } from '@/components/BadgePlate'
import { EventClosed, EventShell } from '@/components/EventShell'
import { asVisibility } from '@/lib/attendee-access'
import { schema, visitorDb } from '@/lib/db'
import { getJoinContext, verifiedAttendeeId } from '@/lib/event-join'

export const metadata: Metadata = { title: { absolute: 'ScanMe' }, robots: { index: false, follow: false } }

/**
 * Someone's public event card: what scanning their badge shows. Read as visitor_user, so RLS
 * only returns completed cards while the event is open; the attendee's own visibility choice
 * (full / name only / hidden) decides what is rendered. Email is never selectable here.
 */
export default async function PublicCardPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
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
        })
        .from(schema.eventAttendees)
        .where(and(eq(schema.eventAttendees.id, id), eq(schema.eventAttendees.eventId, ctx.eventId), eq(schema.eventAttendees.status, 'complete')))
        .limit(1)
    : []

  const level = card ? asVisibility(card.visibility) : 'hidden'
  const role = card?.roleLetter ? ctx.roles.find((r) => r.letter === card.roleLetter)?.label : undefined
  const answers = (card?.answers ?? {}) as Record<string, string>

  return (
    <EventShell eyebrow={ctx.name} title={card && level !== 'hidden' ? card.displayName : 'Event card'} subtitle={role}>
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
        {isMe
          ? <Link href={`/e/${slug}`} className="action-primary w-full justify-center">This is your card · manage it</Link>
          : <Link href={`/e/${slug}`} className="action-secondary w-full justify-center">About this event</Link>}
      </div>
    </EventShell>
  )
}
