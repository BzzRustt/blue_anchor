import type { Metadata } from 'next'
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

  if (!card && !canAddAttendee(ctx.plan, ctx.attendeeCount).ok) {
    return <EventShell eyebrow={ctx.name} title="This event is full" subtitle="It has reached its attendee limit. Please speak to the organiser." />
  }

  return (
    <EventShell eyebrow={ctx.name} title={card ? 'Your card' : 'Join the directory'} subtitle={card ? 'Update what people see about you.' : 'So the people here can find you, and you can find them. It takes about a minute.'}>
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
