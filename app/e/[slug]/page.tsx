import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { eq, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { linkAccount, savePreferences } from '@/app/e/[slug]/actions'
import { unblockAttendee } from '@/app/e/[slug]/network-actions'
import { NetworkNotice } from '@/components/NetworkNotice'
import { AttendeeNav } from '@/components/AttendeeNav'
import { AttendeeRecoveryForm } from '@/components/AttendeeRecoveryForm'
import { BadgePlate } from '@/components/BadgePlate'
import { EventClosed, EventShell } from '@/components/EventShell'
import { asVisibility } from '@/lib/attendee-access'
import { auth } from '@/lib/auth-server'
import { schema, visitorDb, withAttendeeDb, withOwnerDb } from '@/lib/db'
import { getJoinContext, loadMyCard, verifiedAttendeeId } from '@/lib/event-join'
import { formatWhen } from '@/lib/events'
import { rowsOf, unreadCount } from '@/lib/networking'

export const metadata: Metadata = { title: 'Event', robots: { index: false, follow: false } }

const notice = 'rounded-xl border p-3 text-sm'

/** The permanent event link: what goes on the poster and the welcome slide. */
export default async function EventPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ left?: string; access?: string; prefs?: string; linked?: string; ok?: string; e?: string }> }) {
  const { slug } = await params
  const query = await searchParams
  const ctx = await getJoinContext(slug)
  if (!ctx) return <EventClosed />

  // A cover photo exists only if the organiser added one; the version in the address refreshes it after a change.
  const coverRow = await visitorDb.execute(sql`select extract(epoch from updated_at)::bigint as v from event_covers where event_id = ${ctx.eventId}::uuid`).then((r) => (Array.isArray(r) ? r : (r as unknown as { rows: Array<{ v: string }> }).rows)[0] as { v: string } | undefined).catch(() => undefined)
  const cover = coverRow ? `/api/event-cover/${ctx.eventId}?v=${coverRow.v}` : undefined
  const attendeeId = await verifiedAttendeeId(ctx.eventId)
  const card = attendeeId ? await loadMyCard(attendeeId, ctx.eventId) : null
  const live = card && card.status !== 'withdrawn'
  const [prefs] = card
    ? await withAttendeeDb(card.id, (tx) => tx
        .select({ visibility: schema.eventAttendees.profileVisibility, allowMessages: schema.eventAttendees.allowMessages, notifyEmail: schema.eventAttendees.notifyEmail })
        .from(schema.eventAttendees).where(eq(schema.eventAttendees.id, card.id)).limit(1))
    : []
  const [unread, blocked] = live
    ? await Promise.all([unreadCount(card.id), withAttendeeDb(card.id, async (tx) => rowsOf<{ id: string; display_name: string; tag: string }>(await tx.execute(sql`select * from attendee_my_blocks()`))).catch(() => [])])
    : [0, []]
  // Signed in to ScanMe as well? Offer to keep this card on the account (M8).
  const account = live ? await auth.api.getSession({ headers: await headers() }).catch(() => null) : null
  const linked = account
    ? await withOwnerDb(account.user.id, async (db) => rowsOf<{ event_id: string }>(await db.execute(sql`select event_id from my_attended_events()`)))
        .then((rows) => rows.some((r) => r.event_id === ctx.eventId)).catch(() => false)
    : false

  return (
    <EventShell eyebrow="Event" cover={cover} title={ctx.name} subtitle={[formatWhen(ctx.startsAt), ctx.venue].filter(Boolean).join(' · ')}>
      {live && <AttendeeNav slug={slug} active="event" unread={unread} />}
      <div className="grid gap-4">
        <NetworkNotice ok={query.ok} e={query.e} />
        {query.left && <p role="status" className={`${notice} border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]`}>Your card has been removed.</p>}
        {query.access === 'ok' && <p role="status" className={`${notice} border-[var(--accent)] bg-[var(--accent-soft)] font-bold text-[var(--accent-strong)]`}>You are signed in to your event card on this device.</p>}
        {query.access === 'invalid' && <p role="alert" className={`${notice} border-[var(--line)] bg-[var(--surface)]`}>That link is not valid any more. Ask for a new one below or from the organiser.</p>}
        {query.linked && <p role="status" className={`${notice} border-[var(--accent)] bg-[var(--accent-soft)] font-bold text-[var(--accent-strong)]`}>{linked ? 'Added to your ScanMe account. Find it under Events, Attending, including a read-only copy of your conversations after the event.' :'We could not link this card. It may already be linked to another account.'}</p>}
        {query.prefs && <p role="status" className={`${notice} border-[var(--accent)] bg-[var(--accent-soft)] font-bold text-[var(--accent-strong)]`}>Preferences saved.</p>}

        {live && <BadgePlate tag={card.tag} name={card.displayName === 'Walk-up' ? undefined : card.displayName} label="Your tag" />}
        {!card && <p className="text-sm leading-6 text-[var(--muted)]">Add a short card about what you do and what you are looking for. It takes about a minute. You need the event access code from the poster or the welcome slide.</p>}
        <Link href={`/e/${slug}/join`} className="action-primary w-full justify-center">{card ? 'Edit my card' : 'Set up my event profile'}<ArrowRight size={18} weight="bold" /></Link>
        {card && card.status === 'complete' && <Link href={`/e/${slug}/a/${card.id}`} className="action-secondary w-full justify-center">See my card as others do</Link>}

        {live && (
          <section id="keep" className="grid gap-3 rounded-[22px] border border-[var(--accent)] bg-[var(--accent-soft)] p-5">
            <h2 className="font-extrabold">{linked ? 'Kept on your ScanMe account' : 'Keep your conversations after the event'}</h2>
            {linked
              ? <p className="text-sm leading-6 text-[var(--muted)]">This event is under Events, Attending in your account. After messages close you can still read your conversations there (read-only).</p>
              : <p className="text-sm leading-6 text-[var(--muted)]">Messages close 48 hours after the event ends. Add this event to a free ScanMe account to keep a read-only copy of your conversations, and get your own permanent code. Your event card stays separate.</p>}
            {!linked && (account
              ? <form action={linkAccount}><input type="hidden" name="slug" value={slug} /><button className="action-primary w-full justify-center">Add this event to my ScanMe account</button></form>
              : <div className="grid gap-2 sm:grid-cols-2"><Link className="action-primary w-full justify-center" href={`/signup?next=${encodeURIComponent(`/e/${slug}#keep`)}`}>Create a free account</Link><Link className="action-secondary w-full justify-center" href={`/login?next=${encodeURIComponent(`/e/${slug}#keep`)}`}>I have an account</Link></div>)}
          </section>
        )}
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
        {blocked.length > 0 && (
          <section className="grid gap-2 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
            <h2 className="font-extrabold">People you blocked</h2>
            <p className="text-sm text-[var(--muted)]">You don’t see each other in search or on cards, and can’t message each other.</p>
            <ul className="grid gap-2">
              {blocked.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3 text-sm">
                  <span><strong>{b.display_name}</strong> <span className="font-mono text-xs text-[var(--muted)]">{b.tag}</span></span>
                  <form action={unblockAttendee}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="back" value={`/e/${slug}`} /><input type="hidden" name="target" value={b.id} /><button className="action-quiet !min-h-9 text-sm">Unblock</button></form>
                </li>
              ))}
            </ul>
          </section>
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
