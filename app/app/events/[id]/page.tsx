import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowSquareOut, DownloadSimple, Printer } from '@phosphor-icons/react/dist/ssr'
import { addSpareTags, cancelEvent, importRoster, startPublish } from '@/app/app/events/actions'
import { CopyLinkButton } from '@/components/workspace/CopyLinkButton'
import { PageIntro } from '@/components/workspace/PageIntro'
import { appBaseUrl, getOwnedEvent } from '@/lib/event-queries'
import { EVENT_PACKAGES, formatPence } from '@/lib/event-packages'
import { formatWhen } from '@/lib/events'
import { stripeConfigured } from '@/lib/stripe'
import { planLimits, type Plan } from '@/lib/plans'
import { requireOwner } from '@/lib/owner'

const errors: Record<string, string> = {
  empty: 'There was nothing to add.',
  invalid: 'Something in the form was missing or too long.',
  not_found: 'That event could not be found.',
  payments_off: 'Payments are not switched on yet, so this event cannot be published. Nothing has been charged.',
  cancelled: 'Payment was cancelled. Nothing has been charged.',
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; detail?: string; added?: string; paid?: string }> }) {
  const session = await requireOwner()
  const { id } = await params
  const query = await searchParams
  const found = await getOwnedEvent(session.user.id, id)
  if (!found) notFound()

  const { event, slug, roles, attendees } = found
  const url = `${appBaseUrl()}/e/${slug}`
  const roleLabel = new Map(roles.map((role) => [role.letter, role.label]))
  const cap = event.capacity ?? planLimits((session.user.plan ?? 'free') as Plan).attendeesPerEvent
  const published = event.status === 'published'
  const payable = event.status === 'draft' || event.status === 'awaiting_payment'
  const paymentsOn = stripeConfigured()
  const failure = query.error && (query.detail || errors[query.error])
  const limit = query.error === 'attendee_limit'
  const base = `/app/events/${event.id}`

  return (
    <div className="grid gap-7">
      <PageIntro eyebrow={formatWhen(event.startsAt)} title={event.name} body={event.venue ?? 'Add people, then print badges that carry each person’s tag.'} action={<div className="flex flex-wrap gap-3"><a className="action-secondary" href={url} target="_blank" rel="noreferrer"><ArrowSquareOut size={18} />Attendee view</a><a className="action-secondary" href={`${base}/badges.csv`}><DownloadSimple size={18} />Badge CSV</a><Link className="action-primary" href={`${base}/badges`}><Printer size={18} />Print badges</Link></div>} />

      {event.status === 'cancelled' && <p role="status" className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm font-bold">This event is cancelled. Attendees can no longer reach it.</p>}
      {query.paid && !published && <p role="status" className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-bold text-[var(--accent-strong)]">Thanks. We are waiting for the payment to be confirmed; refresh in a moment.</p>}
      {payable && (
        <section className="soft-card grid gap-4 p-5 sm:p-7">
          <div><p className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--faint)]">Draft · not public</p><h2 className="mt-1 text-xl font-extrabold tracking-[-.035em]">Publish your event</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Attendees cannot reach the event page until it is published. You can add people and preview badges first, free. Prices shown are provisional.</p></div>
          <form action={startPublish} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="eventId" value={event.id} />
            {EVENT_PACKAGES.map((pkg, index) => <label key={pkg.key} className="soft-card flex cursor-pointer items-center gap-3 p-4"><input type="radio" name="package" value={pkg.key} defaultChecked={index === 0} /><span><span className="block text-sm font-extrabold">{pkg.name}</span><span className="text-sm text-[var(--muted)]">{formatPence(pkg.pricePence)}</span></span></label>)}
            <button className="action-primary sm:col-span-3" disabled={!paymentsOn}>{paymentsOn ? 'Pay and publish' : 'Payments not switched on yet'}</button>
          </form>
        </section>
      )}
      {query.added && <p role="status" className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-bold text-[var(--accent-strong)]">Added {Number(query.added) || 0} {Number(query.added) === 1 ? 'tag' : 'tags'}.</p>}
      {failure && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-3 text-sm text-[var(--danger)]">{failure} {limit && <Link className="font-bold underline" href="/plans">See plans</Link>}</p>}

      <section className="grid gap-4 md:grid-cols-3">
        <article className="soft-card p-5 md:col-span-2">{!published && <p className="mb-2 text-xs font-bold text-[var(--danger)]">Not public until published.</p>}<p className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--faint)]">Event page</p><p className="mt-2 break-all text-sm font-bold">{url}</p><div className="mt-4"><CopyLinkButton value={url} /></div></article>
        <article className="soft-card p-5"><p className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--faint)]">Access code</p><p className="mt-2 font-mono text-3xl font-extrabold tracking-[.18em]">{event.accessCode}</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Printed on badges and shown on a slide. It keeps crawlers out; it is not a secret.</p></article>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <form action={importRoster} className="soft-card grid content-start gap-4 p-5 sm:p-7">
          <input type="hidden" name="eventId" value={event.id} />
          <h2 className="text-xl font-extrabold tracking-[-.035em]">Add your attendee list</h2>
          <label className="field-label">One person per line<textarea className="field-textarea" name="roster" required rows={7} placeholder={roles.length ? 'Ada Obi, ada@example.com, F\nTunde Bello, tunde@example.com, I' : 'Ada Obi, ada@example.com\nTunde Bello'} /></label>
          <p className="text-xs leading-5 text-[var(--muted)]">Format: name, email{roles.length ? `, role letter (${roles.map((r) => r.letter).join(', ')})` : ''}. Email is optional. Paste straight from a spreadsheet export; all of it is added or none.</p>
          <button className="action-primary">Allocate tags</button>
        </form>

        <form action={addSpareTags} className="soft-card grid content-start gap-4 p-5 sm:p-7">
          <input type="hidden" name="eventId" value={event.id} />
          <h2 className="text-xl font-extrabold tracking-[-.035em]">Spare tags for the day</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">Blank badges for people who register on arrival. They scan the QR, answer the questions and appear in the directory.</p>
          <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">How many<input className="field-input" type="number" name="count" min={1} max={100} defaultValue={10} required /></label>{roles.length > 0 && <label className="field-label">Role<select className="field-input" name="letter" required>{roles.map((role) => <option key={role.letter} value={role.letter}>{role.letter} · {role.label}</option>)}</select></label>}</div>
          <button className="action-secondary">Generate spare tags</button>
        </form>
      </section>

      <section className="soft-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] p-5"><h2 className="font-extrabold">Tags issued</h2><span className="status-draft" aria-label={`${attendees.length} of ${cap} tags used`}>{attendees.length} / {cap}</span></div>
        {attendees.length === 0
          ? <p className="p-8 text-center text-sm text-[var(--muted)]">No tags yet. Add your attendee list or generate spare tags above.</p>
          : <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="text-xs uppercase tracking-[.1em] text-[var(--faint)]"><tr><th className="px-5 py-3">Tag</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{attendees.map((a) => <tr key={a.id} className="border-t border-[var(--line)]"><td className="px-5 py-3 font-mono font-extrabold">{a.tag}</td><td className="px-5 py-3">{a.displayName}</td><td className="px-5 py-3 text-[var(--muted)]">{a.roleLetter ? roleLabel.get(a.roleLetter) ?? a.roleLetter : '—'}</td><td className="px-5 py-3 text-[var(--muted)]">{a.status === 'invited' ? (a.source === 'walk_up' ? 'Spare' : 'Not joined yet') : a.status === 'complete' ? 'Card complete' : 'Withdrawn'}</td></tr>)}</tbody></table></div>}
      </section>
      {event.status !== 'cancelled' && <form action={cancelEvent} className="justify-self-start"><input type="hidden" name="eventId" value={event.id} /><button className="text-sm font-bold text-[var(--danger)] underline">Cancel this event</button></form>}
    </div>
  )
}
