import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { BadgePlate } from '@/components/BadgePlate'
import { EventClosed, EventShell } from '@/components/EventShell'
import { getJoinContext, loadMyCard, verifiedAttendeeId } from '@/lib/event-join'
import { formatWhen } from '@/lib/events'

export const metadata: Metadata = { title: 'Event', robots: { index: false, follow: false } }

/** The permanent event link: what goes on the poster and the welcome slide. */
export default async function EventPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ left?: string }> }) {
  const { slug } = await params
  const query = await searchParams
  const ctx = await getJoinContext(slug)
  if (!ctx) return <EventClosed />

  const attendeeId = await verifiedAttendeeId(ctx.eventId)
  const card = attendeeId ? await loadMyCard(attendeeId, ctx.eventId) : null
  const live = card && card.status !== 'withdrawn'

  return (
    <EventShell eyebrow="Event" title={ctx.name} subtitle={[formatWhen(ctx.startsAt), ctx.venue].filter(Boolean).join(' · ')}>
      <div className="grid gap-4">
        {query.left && <p role="status" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">Your card has been removed.</p>}
        {live && <BadgePlate tag={card.tag} name={card.displayName === 'Walk-up' ? undefined : card.displayName} label="Your tag" />}
        <p className="text-sm leading-6 text-[var(--muted)]">Add a short card about what you do and what you are looking for. It takes about a minute.</p>
        <Link href={`/e/${slug}/join`} className="action-primary w-full justify-center">{live ? 'Edit my card' : 'Join the event'}<ArrowRight size={18} weight="bold" /></Link>
      </div>
    </EventShell>
  )
}
