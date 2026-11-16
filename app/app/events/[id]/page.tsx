import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowSquareOut, DownloadSimple, Printer } from '@phosphor-icons/react/dist/ssr'
import { addGroup, addPerson, addSpareTags, cancelEvent, importRoster, issueAccessLink, startPublish, toggleCheckIn, updateEventSettings } from '@/app/app/events/actions'
import { CopyLinkButton } from '@/components/workspace/CopyLinkButton'
import { PageIntro } from '@/components/workspace/PageIntro'
import { appBaseUrl, getOwnedEvent } from '@/lib/event-queries'
import { EVENT_PACKAGES, formatPence } from '@/lib/event-packages'
import { formatWhen, toLocalInput } from '@/lib/events'
import { stripeConfigured } from '@/lib/stripe'
import { planLimits, type Plan } from '@/lib/plans'
import { requireOwner } from '@/lib/owner'

const errors: Record<string, string> = {
  empty: 'There was nothing to add.',
  invalid: 'Something in the form was missing or too long.',
  not_found: 'That event could not be found.',
  payments_off: 'Payments are not switched on yet, so this event cannot be published. Nothing has been charged.',
  cancelled: 'Payment was cancelled. Nothing has been charged.',
  dates: 'The event must end after it starts, and networking cannot open after it ends.',
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; detail?: string; added?: string; skipped?: string; paid?: string; saved?: string; link?: string; for?: string }> }) {
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
  const registered = attendees.length
  const completed = attendees.filter((a) => a.status === 'complete').length
  const checkedIn = attendees.filter((a) => a.checkedInAt).length
  const remaining = Math.max(0, cap - registered)
  const roleSelect = roles.length > 0 && <label className="field-label">Role<select className="field-input" name="letter" required>{roles.map((role) => <option key={role.letter} value={role.letter}>{role.letter} · {role.label}</option>)}</select></label>

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
      {published && (
        <details className="soft-card p-5">
          <summary className="cursor-pointer font-extrabold">Need more places? Capacity {cap}</summary>
          <form action={startPublish} className="mt-4 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="eventId" value={event.id} />
            {EVENT_PACKAGES.filter((pkg) => pkg.capacity > cap).map((pkg, index) => <label key={pkg.key} className="soft-card flex cursor-pointer items-center gap-3 p-4"><input type="radio" name="package" value={pkg.key} defaultChecked={index === 0} /><span><span className="block text-sm font-extrabold">{pkg.name}</span><span className="text-sm text-[var(--muted)]">{formatPence(pkg.pricePence)}</span></span></label>)}
            {EVENT_PACKAGES.some((pkg) => pkg.capacity > cap)
              ? <button className="action-primary sm:col-span-3" disabled={!paymentsOn}>{paymentsOn ? 'Pay and add places' : 'Payments not switched on yet'}</button>
              : <p className="text-sm text-[var(--muted)] sm:col-span-3">You have the largest package. Contact us for more.</p>}
          </form>
          <p className="mt-2 text-xs text-[var(--muted)]">You pay the full price of the bigger package; credit for the earlier one is not applied yet. Prices are provisional.</p>
        </details>
      )}
      {query.added && <p role="status" className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-bold text-[var(--accent-strong)]">Added {Number(query.added) || 0} {Number(query.added) === 1 ? 'tag' : 'tags'}{Number(query.skipped) > 0 ? `; ${query.skipped} already registered or repeated, skipped` : ''}.</p>}
      {query.link && query.link.startsWith(appBaseUrl()) && (
        <section role="status" className="soft-card grid gap-3 border-[var(--accent)] p-5">
          <p className="text-sm font-extrabold">Personal link for {query.for ?? 'this attendee'}</p>
          <p className="break-all font-mono text-xs">{query.link}</p>
          <p className="text-xs leading-5 text-[var(--muted)]">Send it only to that person. It opens their card on the device they use and works until the event closes. Any earlier link for them has stopped working. This was recorded in the event log.</p>
          <div><CopyLinkButton value={query.link} /></div>
        </section>
      )}
      {query.saved && <p role="status" className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-bold text-[var(--accent-strong)]">Saved. Tags and QR codes are unchanged.</p>}
      {failure && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-3 text-sm text-[var(--danger)]">{failure} {limit && <Link className="font-bold underline" href="/plans">See plans</Link>}</p>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Event numbers">
        {[['Registered', registered], ['Remaining', remaining], ['Completed', completed], ['Checked in', checkedIn]].map(([label, value]) => <article key={label} className="soft-card p-4"><p className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--faint)]">{label}</p><p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p></article>)}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="soft-card p-5 md:col-span-2">{!published && <p className="mb-2 text-xs font-bold text-[var(--danger)]">Not public until published.</p>}<p className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--faint)]">Event page</p><p className="mt-2 break-all text-sm font-bold">{url}</p><div className="mt-4"><CopyLinkButton value={url} /></div></article>
        <article className="soft-card p-5"><p className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--faint)]">Access code</p><p className="mt-2 font-mono text-3xl font-extrabold tracking-[.18em]">{event.accessCode}</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Printed on badges and shown on a slide. It keeps crawlers out; it is not a secret.</p></article>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-5">
          <form action={addPerson} className="soft-card grid content-start gap-4 p-5 sm:p-7">
            <input type="hidden" name="eventId" value={event.id} />
            <h2 className="text-xl font-extrabold tracking-[-.035em]">Add one person</h2>
            <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Name<input className="field-input" name="name" required minLength={2} maxLength={80} /></label><label className="field-label">Email <span className="font-normal text-[var(--faint)]">(optional)</span><input className="field-input" type="email" name="email" /></label>{roleSelect}</div>
            <button className="action-secondary">Add person</button>
          </form>
          <form action={addGroup} className="soft-card grid content-start gap-4 p-5 sm:p-7">
            <input type="hidden" name="eventId" value={event.id} />
            <h2 className="text-xl font-extrabold tracking-[-.035em]">Add a group</h2>
            <p className="text-sm leading-6 text-[var(--muted)]">One contact email, several people. Each person gets their own tag and card; the email is not shared between them.</p>
            <label className="field-label">Contact email<input className="field-input" type="email" name="contactEmail" required /></label>
            <label className="field-label">One name per line<textarea className="field-textarea" name="names" required rows={4} /></label>
            {roleSelect}
            <button className="action-secondary">Add group</button>
          </form>
        </div>
        <form action={importRoster} className="soft-card grid content-start gap-4 p-5 sm:p-7">
          <input type="hidden" name="eventId" value={event.id} />
          <h2 className="text-xl font-extrabold tracking-[-.035em]">Import a list</h2>
          <label className="field-label">CSV file <span className="font-normal text-[var(--faint)]">(or paste below)</span><input className="field-input" type="file" name="file" accept=".csv,text/csv,text/plain" /></label>
          <label className="field-label">One person per line<textarea className="field-textarea" name="roster" rows={6} placeholder={roles.length ? 'Ada Obi, ada@example.com, F\nTunde Bello, tunde@example.com, I' : 'Ada Obi, ada@example.com\nTunde Bello'} /></label>
          <p className="text-xs leading-5 text-[var(--muted)]">A header row is recognised: name (or first and last name), email{roles.length ? ', role' : ''}, reference. Without one the order is name, email{roles.length ? `, role letter (${roles.map((r) => r.letter).join(', ')})` : ''}. Repeated emails or references are skipped and counted, never merged. If any row is wrong, nothing is imported.</p>
          <button className="action-primary">Import</button>
        </form>
        <form action={addSpareTags} className="soft-card grid content-start gap-4 p-5 sm:p-7">
          <input type="hidden" name="eventId" value={event.id} />
          <h2 className="text-xl font-extrabold tracking-[-.035em]">Spare tags for the day</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">Blank badges for people who register on arrival. They scan the QR, answer the questions and appear in the directory.</p>
          <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">How many<input className="field-input" type="number" name="count" min={1} max={100} defaultValue={10} required /></label>{roles.length > 0 && <label className="field-label">Role<select className="field-input" name="letter" required>{roles.map((role) => <option key={role.letter} value={role.letter}>{role.letter} · {role.label}</option>)}</select></label>}</div>
          <button className="action-secondary">Generate spare tags</button>
        </form>
      </section>

      {event.status !== 'cancelled' && (
        <form action={updateEventSettings} className="soft-card grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
          <input type="hidden" name="eventId" value={event.id} />
          <h2 className="text-xl font-extrabold tracking-[-.035em] sm:col-span-2">Details and networking</h2>
          <label className="field-label sm:col-span-2">Event name<input className="field-input" name="name" required minLength={2} maxLength={80} defaultValue={event.name} /></label>
          <label className="field-label sm:col-span-2">Venue<input className="field-input" name="venue" maxLength={120} defaultValue={event.venue ?? ''} /></label>
          <label className="field-label sm:col-span-2">Description<textarea className="field-textarea" name="description" maxLength={500} rows={2} defaultValue={event.description ?? ''} /></label>
          <label className="field-label">Starts ({event.timezone})<input className="field-input" type="datetime-local" name="startsAt" required defaultValue={toLocalInput(event.startsAt, event.timezone)} /></label>
          <label className="field-label">Ends<input className="field-input" type="datetime-local" name="endsAt" required defaultValue={toLocalInput(event.endsAt, event.timezone)} /></label>
          <label className="field-label">How attendees find each other<select className="field-input" name="discovery" defaultValue={event.discovery}><option value="badge">Badge search (default)</option><option value="directory">Full directory</option><option value="off">Off</option></select></label>
          <label className="field-label">Networking opens <span className="font-normal text-[var(--faint)]">(blank = at the start)</span><input className="field-input" type="datetime-local" name="networkingOpensAt" defaultValue={event.networkingOpensAt ? toLocalInput(event.networkingOpensAt, event.timezone) : ''} /></label>
          <label className="flex items-center gap-2 text-sm font-bold sm:col-span-2"><input type="checkbox" name="messagingEnabled" defaultChecked={event.messagingEnabled} />Allow attendee messages <span className="font-normal text-[var(--muted)]">(takes effect when messaging is released)</span></label>
          <p className="text-xs leading-5 text-[var(--muted)] sm:col-span-2">Changing the time keeps every tag and QR code as printed.</p>
          <button className="action-primary sm:col-span-2">Save changes</button>
        </form>
      )}

      <section className="soft-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] p-5"><h2 className="font-extrabold">Tags issued</h2><span className="status-draft" aria-label={`${attendees.length} of ${cap} tags used`}>{attendees.length} / {cap}</span></div>
        {attendees.length === 0
          ? <p className="p-8 text-center text-sm text-[var(--muted)]">No tags yet. Add your attendee list or generate spare tags above.</p>
          : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-xs uppercase tracking-[.1em] text-[var(--faint)]"><tr><th className="px-5 py-3">Tag</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Check-in</th><th className="px-5 py-3">Access</th></tr></thead><tbody>{attendees.map((a) => <tr key={a.id} className="border-t border-[var(--line)]"><td className="px-5 py-3 font-mono font-extrabold">{a.tag}</td><td className="px-5 py-3">{a.displayName}</td><td className="px-5 py-3 text-[var(--muted)]">{a.roleLetter ? roleLabel.get(a.roleLetter) ?? a.roleLetter : '—'}</td><td className="px-5 py-3 text-[var(--muted)]">{a.status === 'invited' ? (a.source === 'walk_up' ? 'Spare' : 'Not joined yet') : a.status === 'complete' ? 'Card complete' : 'Withdrawn'}</td><td className="px-5 py-3"><form action={toggleCheckIn}><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="attendeeId" value={a.id} /><button className="text-sm font-bold text-[var(--accent-strong)] underline">{a.checkedInAt ? 'Checked in · undo' : 'Check in'}</button></form></td><td className="px-5 py-3"><form action={issueAccessLink}><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="attendeeId" value={a.id} /><button className="text-sm font-bold text-[var(--accent-strong)] underline">Personal link</button></form></td></tr>)}</tbody></table></div>}
      </section>
      {event.status !== 'cancelled' && <form action={cancelEvent} className="justify-self-start"><input type="hidden" name="eventId" value={event.id} /><button className="text-sm font-bold text-[var(--danger)] underline">Cancel this event</button></form>}
    </div>
  )
}
