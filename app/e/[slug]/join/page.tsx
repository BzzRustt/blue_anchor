import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr'
import { AttendeeProfileForm } from '@/components/AttendeeProfileForm'
import { EventClosed, EventShell } from '@/components/EventShell'
import { getJoinContext, loadMyCard, verifiedAttendeeId } from '@/lib/event-join'
import { canAddAttendee } from '@/lib/plans'

export const metadata: Metadata = { title: 'Join the event', robots: { index: false, follow: false } }

const when = (date: Date) => date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' })

export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getJoinContext(slug)
  if (!ctx) return <EventClosed />

  const attendeeId = await verifiedAttendeeId(ctx.eventId)
  const card = attendeeId ? await loadMyCard(attendeeId, ctx.eventId) : null

  if (!card && !canAddAttendee(ctx.plan, ctx.attendeeCount, ctx.capacity).ok) {
    return <EventShell eyebrow={ctx.name} title="This event is full" subtitle="It has reached its attendee limit. Please speak to the organiser." />
  }

  return (
    <EventShell eyebrow={ctx.name} title={card ? 'Your card' : 'Join the event'} subtitle={card ? 'Update your name and your answers.' : 'Add a short card about what you do and what you are looking for. It takes about a minute.'}>
      <Link href={`/e/${slug}`} className="action-quiet mb-3 w-fit !px-0"><ArrowLeft size={18} />Event page</Link>
      <AttendeeProfileForm
        slug={slug}
        eventName={ctx.name}
        roles={ctx.roles}
        questions={ctx.questions}
        expiresLabel={when(ctx.expiresAt)}
        existing={card ? { tag: card.tag, name: card.displayName === 'Walk-up' ? '' : card.displayName, answers: card.answers, hidden: card.status === 'withdrawn' } : null}
      />
    </EventShell>
  )
}
