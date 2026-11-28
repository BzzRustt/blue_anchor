import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { ArrowLeft, ArrowSquareOut, DownloadSimple, Printer } from '@phosphor-icons/react/dist/ssr'
import { addGroup, addPerson, addSpareTags, cancelEvent, importRoster, issueAccessLink, removeAttendee, startPublish, toggleCheckIn, updateEventQuestions, updateEventSettings } from '@/app/app/events/actions'
import { ConfirmForm } from '@/components/ConfirmForm'
import { DirtyForm, SaveButton } from '@/components/DirtyForm'
import { TypedConfirmForm } from '@/components/TypedConfirmForm'
import { CopyLinkButton } from '@/components/workspace/CopyLinkButton'
import { schema, withOwnerDb } from '@/lib/db'
import { appBaseUrl, getOwnedEvent } from '@/lib/event-queries'
import { EVENT_PACKAGES, formatPence } from '@/lib/event-packages'
import { eventPhase, formatWhen, publicLabel, toLocalInput } from '@/lib/events'
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
  confirm_name: 'The name you typed did not match, so the event was not cancelled.',
}

const TABS = [['overview', 'Overview'], ['attendees', 'Attendees'], ['badges', 'Badges'], ['settings', 'Settings']] as const
type Tab = (typeof TABS)[number][0]
type Search = { tab?: string; q?: string; error?: string; detail?: string; added?: string; skipped?: string; paid?: string; link?: string; for?: string }

/** People who registered themselves in the last hour, so a sudden spike of sign-ups stands out. */
function selfJoinedLastHour(people: Array<{ source: string; createdAt: Date }>) {
  const hourAgo = Date.now() - 3_600_000
  return people.filter((a) => a.source === 'native' && a.createdAt.getTime() > hourAgo).length
}

const card = 'soft-card grid content-start gap-4 p-5 sm:p-7'
const h2 = 'text-xl font-extrabold tracking-[-.035em]'

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const session = await requireOwner()
  const { id } = await params
  const query = await searchParams
  const found = await getOwnedEvent(session.user.id, id)
  if (!found) notFound()

  const tab: Tab = (TABS.map(([key]) => key) as readonly string[]).includes(query.tab ?? '') ? (query.tab as Tab) : 'overview'
  const { event, slug, roles, attendees } = found
  const url = `${appBaseUrl()}/e/${slug}`
  const base = `/app/events/${event.id}`
  const cap = event.capacity ?? planLimits(((session.user as { plan?: string }).plan ?? 'free') as Plan).attendeesPerEvent
  const published = event.status === 'published'
  const cancelled = event.status === 'cancelled'
  const payable = event.status === 'draft' || event.status === 'awaiting_payment'
  const failure = query.error && (query.detail || errors[query.error])
  const active = attendees.filter((a) => a.status !== 'withdrawn')
  const stats = {
    registered: active.length,
    remaining: Math.max(0, cap - active.length),
    completed: active.filter((a) => a.status === 'complete').length,
    checkedIn: active.filter((a) => a.checkedInAt).length,
    joinedLastHour: selfJoinedLastHour(active),
  }
  // Hidden on every form so each action returns to the tab it came from.
  const tabInput = <input type="hidden" name="tab" value={tab} />
  // Only the Settings tab needs the questions, so only it pays for loading them.
  const questions = tab === 'settings' && !cancelled
    ? await withOwnerDb(session.user.id, (db) => db.select().from(schema.questionBlocks).where(eq(schema.questionBlocks.campaignId, event.campaignId)).orderBy(asc(schema.questionBlocks.position)))
    : []

  return (
    <div className="grid gap-6">
      <Link href="/app/events" className="action-quiet w-fit !px-0"><ArrowLeft size={18} />Events</Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="overline">{formatWhen(event.startsAt)}{event.venue ? ` · ${event.venue}` : ''}</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">{event.name}</h1>
          <p className="mt-2"><span className={published ? 'status-live' : 'status-draft'}>{published ? eventPhase(event.startsAt, event.endsAt, event.directoryExpiresAt) : cancelled ? 'Cancelled' : 'Draft · not public'}</span></p>
        </div>
        {published ? <a className="action-secondary" href={url} target="_blank" rel="noreferrer"><ArrowSquareOut size={18} />Attendee view</a> : <p className="max-w-xs text-xs leading-5 text-[var(--muted)]">The attendee page opens once the event is published. Until then, preview badges in the Badges tab.</p>}
      </header>

      <nav aria-label="Event sections" className="grid grid-cols-4 border-b border-[var(--line)]">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`${base}?tab=${key}`} aria-current={tab === key ? 'page' : undefined} className={`-mb-px min-w-0 truncate border-b-2 px-1 pb-3 text-center text-sm font-bold ${tab === key ? 'border-[var(--accent)] text-[var(--ink)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'}`}>
            {label}{key === 'attendees' && <span className="ml-1.5 rounded-md bg-[var(--surface-muted)] px-1.5 text-xs tabular-nums">{stats.registered}</span>}
          </Link>
        ))}
      </nav>

      {cancelled && <p role="status" className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3 text-sm font-bold">This event is cancelled. Attendees can no longer reach it.</p>}
      {query.paid && !published && <p role="status" className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-bold text-[var(--accent-strong)]">Thanks. We are waiting for the payment to be confirmed; refresh in a moment.</p>}
      {query.added && <p role="status" className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-bold text-[var(--accent-strong)]">Added {Number(query.added) || 0} {Number(query.added) === 1 ? 'person' : 'people'}{Number(query.skipped) > 0 ? `; ${query.skipped} already registered or repeated, skipped` : ''}.</p>}
      {query.link && query.link.startsWith(appBaseUrl()) && (
        <section role="status" className="soft-card grid gap-3 border-[var(--accent)] p-5">
          <p className="text-sm font-extrabold">Personal link for {query.for ?? 'this attendee'}</p>
          <p className="break-all font-mono text-xs">{query.link}</p>
          <p className="text-xs leading-5 text-[var(--muted)]">Send it only to that person. It opens their card on the device they use and works until the event closes. Any earlier link for them has stopped working. This was recorded in the event log.</p>
          <div><CopyLinkButton value={query.link} /></div>
        </section>
      )}
      {failure && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-3 text-sm text-[var(--danger)]">{failure} {query.error === 'attendee_limit' && <Link className="font-bold underline" href={`${base}?tab=overview`}>Add places</Link>}</p>}

      {tab === 'overview' && overview()}
      {tab === 'attendees' && attendeesTab()}
      {tab === 'badges' && badges()}
      {tab === 'settings' && settings()}
    </div>
  )

  // Plain render helpers (not components): they share this page's data through the closure.
  function overview() {
    const paymentsOn = stripeConfigured()
    const steps = [
      { done: active.length > 0, text: 'Add your attendees (or spare tags for walk-ups)', href: `${base}?tab=attendees` },
      { done: false, text: 'Print badges, or download the badge CSV for your printer', href: `${base}?tab=badges` },
      { done: published, text: 'Publish, then share the event link and access code', href: `${base}?tab=overview#publish` },
    ]
    return (
      <div className="grid gap-5">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Event numbers">
          {([['Registered', stats.registered], ['Places left', stats.remaining], ['Cards complete', stats.completed], ['Checked in', stats.checkedIn]] as const).map(([label, value]) => <article key={label} className="soft-card p-4"><p className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--faint)]">{label}</p><p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p></article>)}
        </section>
        {stats.joinedLastHour > 0 && <p className="text-sm text-[var(--muted)]"><strong className="text-[var(--ink)]">{stats.joinedLastHour}</strong> {stats.joinedLastHour === 1 ? 'person' : 'people'} joined themselves in the last hour. If that looks wrong, check the Attendees tab; you can remove anyone.</p>}

        <section className="grid gap-4 md:grid-cols-3">
          <article className="soft-card p-5 md:col-span-2">{!published && <p className="mb-2 text-xs font-bold text-[var(--danger)]">Not public until published.</p>}<p className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--faint)]">Event page</p><p className="mt-2 break-all text-sm font-bold">{url}</p><div className="mt-4"><CopyLinkButton value={url} /></div></article>
          <article className="soft-card p-5"><p className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--faint)]">Access code</p><p className="mt-2 font-mono text-3xl font-extrabold tracking-[.18em]">{event.accessCode}</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Put it on a slide or poster. New people need it to join.</p></article>
        </section>

        {!cancelled && (
          <section className="soft-card grid gap-3 p-5">
            <h2 className="font-extrabold">Next steps</h2>
            <ol className="grid gap-2">{steps.map((s, i) => <li key={s.text} className="flex items-center gap-3 text-sm"><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold ${s.done ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--surface-muted)]'}`}>{s.done ? '✓' : i + 1}</span><Link href={s.href} className={s.done ? 'text-[var(--muted)] line-through' : 'font-bold hover:underline'}>{s.text}</Link></li>)}</ol>
          </section>
        )}

        {payable && (
          <section id="publish" className={card}>
            <div><p className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--faint)]">Draft · not public</p><h2 className={`mt-1 ${h2}`}>Publish your event</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Attendees cannot reach the event page until it is published. You can add people and preview badges first, free.</p></div>
            <form action={startPublish} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="eventId" value={event.id} />
              {EVENT_PACKAGES.map((pkg, index) => <label key={pkg.key} className="soft-card flex cursor-pointer items-center gap-3 p-4"><input type="radio" name="package" value={pkg.key} defaultChecked={index === 0} /><span><span className="block text-sm font-extrabold">{pkg.name}</span><span className="text-sm text-[var(--muted)]">{formatPence(pkg.pricePence)}</span></span></label>)}
              <p className="text-xs leading-5 text-[var(--muted)] sm:col-span-3">By paying you agree to our <Link href="/terms#refunds" className="font-bold underline">Terms</Link>, including how cancellation and refunds work.</p>
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
            <p className="mt-2 text-xs text-[var(--muted)]">You pay the full price of the bigger package; credit for the earlier one is not applied yet.</p>
          </details>
        )}
      </div>
    )
  }

  function attendeesTab() {
    const roleLabel = new Map(roles.map((role) => [role.letter, role.label]))
    const roleSelect = roles.length > 0 && <label className="field-label">Role<select className="field-input" name="letter" required>{roles.map((role) => <option key={role.letter} value={role.letter}>{role.letter} · {role.label}</option>)}</select></label>
    const q = (query.q ?? '').trim().toLowerCase()
    const shown = attendees.filter((a) => !q || a.displayName.toLowerCase().includes(q) || a.tag.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q))
    const hidden = <><input type="hidden" name="eventId" value={event.id} />{tabInput}{q && <input type="hidden" name="q" value={q} />}</>
    return (
      <div className="grid gap-5">
        {!cancelled && (
          <details className="soft-card p-5" open={attendees.length === 0}>
            <summary className="cursor-pointer text-lg font-extrabold">Add people</summary>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <form action={addPerson} className="grid content-start gap-4">
                {hidden}
                <h2 className="font-extrabold">One person</h2>
                <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Name<input className="field-input" name="name" required minLength={2} maxLength={80} /></label><label className="field-label">Email <span className="font-normal text-[var(--faint)]">(lets them recover their card)</span><input className="field-input" type="email" name="email" /></label>{roleSelect}</div>
                <button className="action-secondary w-fit">Add person</button>
              </form>
              <form action={addGroup} className="grid content-start gap-4">
                {hidden}
                <h2 className="font-extrabold">A group</h2>
                <p className="text-sm leading-6 text-[var(--muted)]">Several people, one contact email (for example a company booking). Each person gets their own tag and card. To get into their card, each person can use “Already registered?” on the event page (once email is switched on, everyone’s personal link goes to the contact email), or you can create a personal link for any of them in the list below.</p>
                <label className="field-label">Contact email<input className="field-input" type="email" name="contactEmail" required /></label>
                <label className="field-label">One name per line<textarea className="field-textarea" name="names" required rows={4} /></label>
                {roleSelect}
                <button className="action-secondary w-fit">Add group</button>
              </form>
              <form action={importRoster} className="grid content-start gap-4">
                {hidden}
                <h2 className="font-extrabold">Import a list</h2>
                <label className="field-label">CSV file <span className="font-normal text-[var(--faint)]">(or paste below)</span><input className="field-input" type="file" name="file" accept=".csv,text/csv,text/plain" /></label>
                <label className="field-label">One person per line<textarea className="field-textarea" name="roster" rows={5} placeholder={roles.length ? 'Ada Obi, ada@example.com, F\nTunde Bello, tunde@example.com, I' : 'Ada Obi, ada@example.com\nTunde Bello'} /></label>
                <p className="text-xs leading-5 text-[var(--muted)]">A header row is recognised: name (or first and last name), email{roles.length ? ', role' : ''}, reference. Without one the order is name, email{roles.length ? `, role letter (${roles.map((r) => r.letter).join(', ')})` : ''}. Repeated emails or references are skipped and counted, never merged. If any row is wrong, nothing is imported.</p>
                <button className="action-primary w-fit">Import</button>
              </form>
              <form action={addSpareTags} className="grid content-start gap-4">
                {hidden}
                <h2 className="font-extrabold">Spare tags for walk-ups</h2>
                <p className="text-sm leading-6 text-[var(--muted)]">Blank badges for people who register on arrival. They scan the QR, answer the questions and appear in the directory.</p>
                <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">How many<input className="field-input" type="number" name="count" min={1} max={100} defaultValue={10} required /></label>{roles.length > 0 && <label className="field-label">Role<select className="field-input" name="letter" required>{roles.map((role) => <option key={role.letter} value={role.letter}>{role.letter} · {role.label}</option>)}</select></label>}</div>
                <button className="action-secondary w-fit">Generate spare tags</button>
              </form>
            </div>
          </details>
        )}

        <section className="soft-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-5">
            <h2 className="font-extrabold">People <span className="status-draft ml-1" aria-label={`${stats.registered} of ${cap} places used`}>{stats.registered} / {cap}</span></h2>
            <form className="flex gap-2" role="search"><input type="hidden" name="tab" value="attendees" /><label htmlFor="attendee-search" className="sr-only">Search attendees</label><input id="attendee-search" className="field-input !min-h-10 w-56" type="search" name="q" defaultValue={query.q ?? ''} placeholder="Name, tag or email" /><button className="action-secondary !min-h-10">Search</button>{q && <Link href={`${base}?tab=attendees`} className="action-quiet !min-h-10">Clear</Link>}</form>
          </div>
          {shown.length === 0
            ? <p className="p-8 text-center text-sm text-[var(--muted)]">{q ? 'Nobody matches that search.' : 'No one yet. Add your attendee list or generate spare tags above.'}</p>
            : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="text-xs uppercase tracking-[.1em] text-[var(--faint)]"><tr><th className="px-5 py-3">Tag</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Check-in</th><th className="px-5 py-3">Actions</th></tr></thead>
              <tbody>{shown.map((a) => {
                const removed = a.status === 'withdrawn'
                const rowHidden = <><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="attendeeId" value={a.id} />{tabInput}{q && <input type="hidden" name="q" value={q} />}</>
                return (
                  <tr key={a.id} className={`border-t border-[var(--line)] ${removed ? 'text-[var(--faint)]' : ''}`}>
                    <td className="px-5 py-3 font-mono font-extrabold">{a.tag}</td>
                    <td className="px-5 py-3">{a.displayName}{a.email && <span className="block text-xs text-[var(--muted)]">{a.email}</span>}</td>
                    <td className="px-5 py-3 text-[var(--muted)]">{a.roleLetter ? roleLabel.get(a.roleLetter) ?? a.roleLetter : '—'}</td>
                    <td className="px-5 py-3 text-[var(--muted)]">{a.status === 'invited' ? (a.source === 'walk_up' ? 'Spare' : 'Not joined yet') : a.status === 'complete' ? 'Card complete' : 'Removed'}</td>
                    <td className="px-5 py-3">{!removed && <form action={toggleCheckIn}>{rowHidden}<button className={a.checkedInAt ? 'status-live' : 'text-sm font-bold text-[var(--accent-strong)] underline'}>{a.checkedInAt ? 'Checked in · undo' : 'Check in'}</button></form>}</td>
                    <td className="px-5 py-3">{!removed && !cancelled && (
                      <div className="flex flex-wrap items-center gap-3">
                        <form action={issueAccessLink}>{rowHidden}<button className="text-sm font-bold text-[var(--accent-strong)] underline">Personal link</button></form>
                        <ConfirmForm action={removeAttendee} tone="danger" title={`Remove ${a.displayName}?`} message="Their card leaves the directory, their personal links stop working and their place is freed for someone else. Their tag number is not reused. To undo, add them again." confirmLabel="Remove" triggerLabel="Remove" triggerClassName="text-sm font-bold text-[var(--danger)] underline">{rowHidden}</ConfirmForm>
                      </div>
                    )}</td>
                  </tr>
                )
              })}</tbody></table></div>}
        </section>
      </div>
    )
  }

  function badges() {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        <section className={card}>
          <h2 className={h2}>Print badges</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">A4 sheets, 8 badges per page with cut marks. Each badge shows the person’s name, their tag and a QR code that opens their public card.</p>
          <Link className="action-primary w-fit" href={`${base}/badges`}><Printer size={18} />Open the print sheet</Link>
        </section>
        <section className={card}>
          <h2 className={h2}>Badge CSV</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">For a badge printer or a print shop: one row per person with name, tag, role and the QR link.</p>
          <a className="action-secondary w-fit" href={`${base}/badges.csv`}><DownloadSimple size={18} />Download CSV</a>
        </section>
      </div>
    )
  }

  function settings() {
    if (cancelled) return <p className="soft-card p-6 text-sm text-[var(--muted)]">A cancelled event can’t be changed.</p>
    const rows = [...questions, ...Array.from({ length: Math.max(0, 6 - questions.length) }, () => null)].slice(0, 6)
    return (
      <div className="grid gap-5">
        <DirtyForm action={updateEventSettings} className="soft-card grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
          <input type="hidden" name="eventId" value={event.id} />{tabInput}
          <h2 className={`${h2} sm:col-span-2`}>Details and networking</h2>
          <label className="field-label sm:col-span-2">Event name<input className="field-input" name="name" required minLength={2} maxLength={80} defaultValue={event.name} /></label>
          <label className="field-label sm:col-span-2">Venue<input className="field-input" name="venue" maxLength={120} defaultValue={event.venue ?? ''} /></label>
          <label className="field-label sm:col-span-2">Description<textarea className="field-textarea" name="description" maxLength={500} rows={2} defaultValue={event.description ?? ''} /></label>
          <label className="field-label">Starts ({event.timezone})<input className="field-input" type="datetime-local" name="startsAt" required defaultValue={toLocalInput(event.startsAt, event.timezone)} /></label>
          <label className="field-label">Ends<input className="field-input" type="datetime-local" name="endsAt" required defaultValue={toLocalInput(event.endsAt, event.timezone)} /></label>
          <label className="field-label">How attendees find each other<select className="field-input" name="discovery" defaultValue={event.discovery}><option value="badge">Badge search (default): by the tag on a badge</option><option value="directory">Full directory: browse and search by name or keyword</option><option value="off">Off</option></select></label>
          <label className="field-label">Networking opens <span className="font-normal text-[var(--faint)]">(blank = at the start)</span><input className="field-input" type="datetime-local" name="networkingOpensAt" defaultValue={event.networkingOpensAt ? toLocalInput(event.networkingOpensAt, event.timezone) : ''} /></label>
          <label className="flex items-center gap-2 text-sm font-bold sm:col-span-2"><input type="checkbox" name="messagingEnabled" defaultChecked={event.messagingEnabled} />Allow attendee messages</label>
          <p className="text-xs leading-5 text-[var(--muted)] sm:col-span-2">Changing the time keeps every tag and QR code as printed.</p>
          <SaveButton className="sm:col-span-2" />
        </DirtyForm>

        <DirtyForm action={updateEventQuestions} className="soft-card grid gap-4 p-5 sm:p-7">
          <input type="hidden" name="eventId" value={event.id} />{tabInput}
          <div><h2 className={h2}>Questions attendees answer</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">The question is what people are asked when they join. The card label is the short heading shown above their answer on their card (for example “Can help with”). The first two are required; you can add up to two optional extras, like “A fun fact about you”.</p></div>
          {rows.map((q, n) => {
            const cfg = (q?.config ?? {}) as { prompt?: string; label?: string }
            return (
              <div key={q?.id ?? `new-${n}`} className="grid gap-3 rounded-xl border border-[var(--line)] p-4 sm:grid-cols-[1fr_220px]">
                {q && <input type="hidden" name={`qid_${n}`} value={q.id} />}
                <label className="field-label">{q ? `Question ${n + 1}${q.required ? ' (required)' : ' (optional)'}` : `Extra question ${n - questions.length + 1} (optional)`}<input className="field-input" name={`prompt_${n}`} maxLength={120} defaultValue={cfg.prompt ?? ''} placeholder={q ? '' : 'e.g. A fun fact about you'} required={!!q && n < 4} /></label>
                <label className="field-label">Card label<input className="field-input" name={`label_${n}`} maxLength={40} defaultValue={cfg.label ?? ''} placeholder={cfg.prompt ? publicLabel(cfg.prompt) : 'e.g. Fun fact'} /></label>
              </div>
            )
          })}
          <p className="text-xs leading-5 text-[var(--muted)]">Rewording a question keeps the answers already given. Clearing an extra question removes it from cards.</p>
          <SaveButton label="Save questions" />
        </DirtyForm>

        <section className="soft-card grid gap-3 border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] p-5 sm:p-7">
          <h2 className={h2}>Cancel this event</h2>
          <p className="text-sm leading-6 text-[var(--muted)]">Only if the event is not happening. Attendees lose access to the event page, their cards, saved people and messages.</p>
          <div><TypedConfirmForm action={cancelEvent} phrase={event.name} title={`Cancel ${event.name}?`} confirmLabel="Cancel the event" triggerLabel="Cancel this event…"
            consequences={['The event page stops working for everyone, straight away.', `${stats.registered} attendees lose their cards, saved people and messages.`, 'Printed badges and QR codes stop opening anything.', 'Payments are not refunded automatically.']}>
            <input type="hidden" name="eventId" value={event.id} />
          </TypedConfirmForm></div>
        </section>
      </div>
    )
  }
}
