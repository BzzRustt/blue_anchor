import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { eq } from 'drizzle-orm'
import { savePreferences } from '@/app/e/[slug]/actions'
import { AttendeeNav } from '@/components/AttendeeNav'
import { AttendeeRecoveryForm } from '@/components/AttendeeRecoveryForm'
import { BadgePlate } from '@/components/BadgePlate'
import { EventClosed, EventShell } from '@/components/EventShell'
import { asVisibility } from '@/lib/attendee-access'
import { schema, withAttendeeDb } from '@/lib/db'
import { getJoinContext, loadMyCard, verifiedAttendeeId } from '@/lib/event-join'
import { formatWhen } from '@/lib/events'
import { unreadCount } from '@/lib/networking'

export const metadata: Metadata = { title: 'Event', robots: { index: false, follow: false } }

const notice = 'rounded-xl border p-3 text-sm'

/** The permanent event link: what goes on the poster and the welcome slide. */
export default async function EventPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ left?: string; access?: string; prefs?: string }> }) {
  const { slug } = await params
  const query = await searchParams
  const ctx = await getJoinContext(slug)
  if (!ctx) return <EventClosed />

  const attendeeId = await verifiedAttendeeId(ctx.eventId)
  const card = attendeeId ? await loadMyCard(attendeeId, ctx.eventId) : null
  const live = card && card.status !== 'withdrawn'
  const [prefs] = card
    ? await withAttendeeDb(card.id, (tx) => tx
        .select({ visibility: schema.eventAttendees.profileVisibility, allowMessages: schema.eventAttendees.allowMessages, notifyEmail: schema.eventAttendees.notifyEmail })
        .from(schema.eventAttendees).where(eq(schema.eventAttendees.id, card.id)).limit(1))
    : []
  const unread = live ? await unreadCount(card.id) : 0

  return (
    <EventShell eyebrow="Event" title={ctx.name} subtitle={[formatWhen(ctx.startsAt), ctx.venue].filter(Boolean).join(' · ')}>
      {live && <AttendeeNav slug={slug} active="event" unread={unread} />}
      <div className="grid gap-4">
        {query.left && <p role="status" className={`${notice} border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]`}>Your card has been removed.</p>}
        {query.access === 'ok' && <p role="status" className={`${notice} border-[var(--accent)] bg-[var(--accent-soft)] font-bold text-[var(--accent-strong)]`}>You are signed in to your event card on this device.</p>}
        {query.access === 'invalid' && <p role="alert" className={`${notice} border-[var(--line)] bg-[var(--surface)]`}>That link is not valid any more. Ask for a new one below or from the organiser.</p>}
        {query.prefs && <p role="status" className={`${notice} border-[var(--accent)] bg-[var(--accent-soft)] font-bold text-[var(--accent-strong)]`}>Preferences saved.</p>}

        {live && <BadgePlate tag={card.tag} name={card.displayName === 'Walk-up' ? undefined : card.displayName} label="Your tag" />}
        {!card && <p className="text-sm leading-6 text-[var(--muted)]">Add a short card about what you do and what you are looking for. It takes about a minute. You need the event access code from the poster or the welcome slide.</p>}
        <Link href={`/e/${slug}/join`} className="action-primary w-full justify-center">{card ? 'Edit my card' : 'Set up my event profile'}<ArrowRight size={18} weight="bold" /></Link>
        {card && card.status === 'complete' && <Link href={`/e/${slug}/a/${card.id}`} className="action-secondary w-full justify-center">See my card as others do</Link>}

        {card && prefs && (
          <form action={savePreferences} className="grid gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
            <input type="hidden" name="slug" value={slug} />
            <h2 className="font-extrabold">Preferences</h2>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-bold">When someone scans my badge, show</legend>
              {([['full', 'My full card'], ['name', 'My name and tag only'], ['hidden', 'Nothing (hidden)']] as const).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="visibility" value={value} defaultChecked={asVisibility(prefs.visibility) === value} />{label}</label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowMessages" defaultChecked={prefs.allowMessages} />Allow message requests <span className="text-[var(--muted)]">(when the organiser turns messaging on)</span></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notifyEmail" defaultChecked={prefs.notifyEmail} />Email me about requests <span className="text-[var(--muted)]">(never the message itself)</span></label>
            <button className="action-secondary w-full justify-center">Save preferences</button>
          </form>
        )}

        {!card && (
          <details className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
            <summary className="cursor-pointer font-extrabold">Already registered?</summary>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">We will email a personal link that opens your card on this device. Scanning your badge shows your public card; it does not sign you in.</p>
            <div className="mt-3"><AttendeeRecoveryForm slug={slug} /></div>
          </details>
        )}
      </div>
    </EventShell>
  )
}
