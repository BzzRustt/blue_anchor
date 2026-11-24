import Link from 'next/link'
import { ChatCircleDots, Eye, Pause, SquaresFour } from '@phosphor-icons/react/dist/ssr'
import { toggleCode } from '@/app/app/actions'
import { ConfirmForm } from '@/components/ConfirmForm'
import { GoLiveDialog } from '@/components/workspace/GoLiveDialog'
import { PendingLink, PendingNav, PendingRegion } from '@/components/PendingNav'
import { InboxControls } from '@/components/workspace/InboxControls'
import { ResponseRow } from '@/components/workspace/ResponseRow'
import { ShowQrDialog } from '@/components/workspace/ShowQrDialog'
import { asInboxFilter, inboxItems, type InboxFilter } from '@/lib/inbox'
import { requireOwner } from '@/lib/owner'
import { ownerSummary } from '@/lib/product'

type Search = { view?: string; filter?: string; source?: string }

const modeName = (mode: string) => mode.replace('_', ' ').replace(/^./, (c) => c.toUpperCase())

function greeting(name: string) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/London' }).format(new Date()))
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return `${part}, ${name.split(/\s+/)[0]}.`
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireOwner()
  const query = await searchParams
  const view = query.view === 'analytics' ? 'analytics' : 'inbox'
  const filter = asInboxFilter(query.filter)
  const source = query.source ?? ''
  // The summary (shared with the layout) and the inbox list run side by side, not one after the other.
  const [home, items] = await Promise.all([
    ownerSummary(session.user.id),
    view === 'inbox' ? inboxItems(session.user.id, filter, source) : Promise.resolve([]),
  ])
  const { code, active, counts, days, since, campaigns } = home
  if (!code) throw new Error('Personal code missing after setup')
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const url = `${baseUrl}/t/${code.slug}`
  const shortCode = code.slug.toUpperCase()

  const stats = [
    { label: 'Unread messages', value: String(counts.unread).padStart(2, '0'), note: counts.unread ? 'Needs your attention' : 'All caught up' },
    { label: 'Profile visits', value: String(counts.visits30), note: 'Last 30 days' },
    { label: 'Responses received', value: String(counts.responses), note: since ? 'Last 30 days, all Modes' : 'Across your Modes' },
  ]

  return (
    <div className="grid gap-7">
      <header>
        <p className="overline">Personal space</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">{greeting(home.name ?? session.user.name)}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Here is what has been happening with your ScanMe.</p>
      </header>

      <section aria-label="Summary" className="grid grid-cols-3 gap-2 sm:gap-3">
        {stats.map((stat) => <article key={stat.label} className="soft-card p-3 sm:p-5"><p className="text-xs text-[var(--muted)]">{stat.label}</p><p className="mt-2 text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">{stat.value}</p><p className="mt-2 text-[11px] leading-4 text-[var(--muted)] sm:text-xs">{stat.note}</p></article>)}
      </section>

      <section aria-labelledby="my-scanme" className="deep-card p-6 sm:p-8">
        <span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border border-white/10 bg-white/[.03]" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <p id="my-scanme" className="text-[11px] font-extrabold uppercase tracking-[.16em] text-[var(--on-deep-muted)]">My ScanMe</p>
          <span className={`rounded-md px-2 py-1 text-xs font-bold ${code.isLive ? 'bg-white text-[var(--deep)]' : 'bg-white/15 text-white'}`}>{code.isLive ? 'Sharing on' : 'Sharing paused'}</span>
        </div>
        <h2 className="relative mt-4 text-3xl font-extrabold tracking-[-.05em]">{active ? modeName(active.mode) : 'No Mode'} <span className="serif-accent text-[var(--lime)]">Mode</span></h2>
        <p className="relative mt-2 max-w-md text-sm leading-6 text-[var(--on-deep-muted)]">Your permanent code <strong className="text-white">{shortCode}</strong> opens whatever Mode you have chosen to share.{!code.isLive && ' Sharing is paused, so visitors see an unavailable page.'}</p>
        <div className="relative mt-6 flex flex-wrap items-center gap-2">
          <ShowQrDialog url={url} code={shortCode} triggerClassName="action-secondary !border-white !bg-white !text-[var(--deep)]" />
          {/* The preview route never sends anything, so you can't message yourself from it. */}
          <Link href={`/app/modes/${active?.mode ?? 'basic'}/preview`} className="action-secondary !border-white/50 !bg-transparent !text-white hover:!bg-white/10"><Eye size={18} />Visitor preview</Link>
          <Link href="/app/modes" className="action-quiet !text-[var(--lime)] hover:!bg-white/10"><SquaresFour size={18} />Switch Mode</Link>
          <span className="ml-auto">
            {code.isLive
              ? <ConfirmForm action={toggleCode} tone="danger" title="Pause personal sharing?" message="Anyone scanning your QR will see an unavailable page until you turn sharing back on. Your Modes and responses stay in your workspace." confirmLabel="Pause sharing" triggerLabel={<><Pause size={18} weight="bold" />Pause sharing</>} triggerClassName="action-quiet !text-white hover:!bg-white/10"><input type="hidden" name="codeId" value={code.id} /><input type="hidden" name="enabled" value="false" /></ConfirmForm>
              : <GoLiveDialog codeId={code.id} modeName={active ? modeName(active.mode) : 'Basic'} modeKey={active?.mode ?? 'basic'} question={home.liveQuestion} />}
          </span>
        </div>
      </section>

      <PendingNav>
        <section aria-label="Inbox and analytics" className="grid gap-5">
          <nav aria-label="Home sections" className="flex gap-6 border-b border-[var(--line)]">
            {([['inbox', 'Personal inbox'], ['analytics', 'Audience insights']] as const).map(([key, label]) => <PendingLink key={key} href={key === 'inbox' ? '/app' : '/app?view=analytics'} current={view === key} className={`-mb-px border-b-2 px-1 pb-3 text-sm font-bold ${view === key ? 'border-[var(--accent)] text-[var(--ink)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'}`}>{label}</PendingLink>)}
          </nav>
          {view === 'inbox' ? (
            <div className="grid gap-4">
              <p className="text-sm text-[var(--muted)]">Messages and responses through your personal QR only. Click one to read it in full.</p>
              <InboxControls filter={filter} source={campaigns.some((c) => c.id === source) ? source : ''} counts={{ all: counts.open, unread: counts.unread, archived: counts.archived, blocked: counts.blocked }} sources={campaigns.map((c) => ({ id: c.id, label: `${c.name} · ${modeName(c.mode)}` }))} />
              <PendingRegion className="soft-card overflow-hidden">
                {items.length === 0 ? <EmptyInbox filter={filter} /> : <ul className="divide-y divide-[var(--line)]">{items.map((item) => <ResponseRow key={item.id} item={item} />)}</ul>}
              </PendingRegion>
              {since && <p className="text-xs text-[var(--muted)]">The free plan shows responses from the last 30 days.</p>}
            </div>
          ) : (
            <PendingRegion><Analytics days={days} visits={counts.visits30} responses={counts.responses30} clicks={counts.clicks30} /></PendingRegion>
          )}
        </section>
      </PendingNav>
    </div>
  )
}

function EmptyInbox({ filter }: { filter: InboxFilter }) {
  const copy = {
    all: ['Your first response will land here', 'Show your QR, then come back here to read ratings and private messages.'],
    unread: ['You are all caught up', 'New responses will appear here.'],
    archived: ['Nothing archived', 'Responses you archive are kept here. You can move them back any time.'],
    blocked: ['Nobody is blocked', 'If you block a visitor, their responses are kept here and you can unblock them.'],
  }[filter]
  return <div className="grid min-h-56 place-items-center p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><ChatCircleDots size={24} /></span><h3 className="mt-4 font-extrabold">{copy[0]}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">{copy[1]}</p></div></div>
}

function Analytics({ days, visits, responses, clicks }: { days: Array<{ key: string; label: string; count: number }>; visits: number; responses: number; clicks: number }) {
  const max = Math.max(1, ...days.map((day) => day.count))
  const tiles = [
    { label: 'Visits', value: String(visits), note: 'Last 30 days' },
    { label: 'Responses', value: String(responses), note: 'Last 30 days' },
    { label: 'Outbound clicks', value: String(clicks), note: 'Links visitors opened, last 30 days' },
    { label: 'Response rate', value: visits ? `${Math.round((responses / visits) * 100)}%` : '–', note: 'Responses ÷ visits' },
  ]
  return (
    <div className="grid gap-4">
      <p className="text-sm text-[var(--muted)]">A clear view of activity on your personal page.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">{tiles.map((tile) => <article key={tile.label} className="soft-card p-3 sm:p-5"><p className="text-xs text-[var(--muted)]">{tile.label}</p><p className="mt-2 text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">{tile.value}</p><p className="mt-2 text-[11px] text-[var(--muted)] sm:text-xs">{tile.note}</p></article>)}</div>
      <article className="soft-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold tracking-[-.03em]">Your activity this week</h3><p className="mt-1 text-xs text-[var(--muted)]">Page visits, not confirmed physical scans</p></div><span className="plan-badge">Last 7 days</span></div>
        <div className="mt-6 grid h-52 grid-cols-7 items-end gap-2 border-b border-[var(--line)] sm:gap-4" role="img" aria-label={`Visits per day: ${days.map((d) => `${d.label} ${d.count}`).join(', ')}`}>
          {days.map((day) => <div key={day.key} className="grid h-full grid-rows-[1fr_auto] items-end gap-2 text-center"><div className="flex h-full items-end"><div className={`w-full rounded-t-md ${day.count === max && day.count > 0 ? 'bg-[var(--accent)]' : 'bg-[var(--surface-muted)]'}`} style={{ height: `${Math.max(4, (day.count / max) * 100)}%` }} /></div><span className="pb-2 text-xs font-bold text-[var(--muted)]">{day.label}</span></div>)}
        </div>
      </article>
    </div>
  )
}
