import Link from 'next/link'
import { ChatCircleDots, Eye, Pause, SquaresFour } from '@phosphor-icons/react/dist/ssr'
import { toggleCode } from '@/app/app/actions'
import { ConfirmForm } from '@/components/ConfirmForm'
import { GoLiveDialog } from '@/components/workspace/GoLiveDialog'
import { PendingLink, PendingNav, PendingRegion } from '@/components/PendingNav'
import { InboxControls } from '@/components/workspace/InboxControls'
import { InboxList } from '@/components/workspace/InboxList'
import { ShowQrDialog } from '@/components/workspace/ShowQrDialog'
import { asInboxFilter, inboxItems, type InboxFilter } from '@/lib/inbox'
import { asRange, busiestDay, getInsights, percentChange, rate, type Insights } from '@/lib/insights'
import { MODE_INFO, type ModeKey } from '@/lib/modes'
import { requireOwner } from '@/lib/owner'
import { ownerSummary } from '@/lib/product'

type Search = { view?: string; filter?: string; source?: string; range?: string }

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
  const insights = view === 'analytics' ? await getInsights(session.user.id, asRange(query.range)) : null
  const { code, active, counts, days, since, campaigns } = home
  if (!code) throw new Error('Personal code missing after setup')
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const url = `${baseUrl}/t/${code.slug}`
  const shortCode = code.slug.toUpperCase()


  return (
    <div className="grid gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">{greeting(home.name ?? session.user.name)}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Your conversations, all in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <p className="flex items-center gap-4 text-sm text-[var(--muted)]"><span><strong className="text-xl text-[var(--ink)]">{counts.unread}</strong> unread</span><span aria-hidden="true" className="h-6 w-px bg-[var(--line)]" /><span><strong className="text-xl text-[var(--ink)]">{counts.visits30}</strong> visits (30 days)</span></p>
          <ShowQrDialog url={url} code={shortCode} triggerClassName="action-primary" />
        </div>
      </header>

      <section aria-labelledby="my-scanme" className="soft-card flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><SquaresFour size={24} /></span>
        <div className="min-w-0 flex-1">
          <h2 id="my-scanme" className="flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-[-.03em]">{active ? modeName(active.mode) : 'No'} Mode <span className={code.isLive ? 'status-live' : 'status-draft'}>{code.isLive ? 'Live' : 'Sharing paused'}</span></h2>
          <p className="text-sm text-[var(--muted)]">{active && active.mode in MODE_INFO ? MODE_INFO[active.mode as ModeKey].blurb : 'Pick a Mode to decide what people see.'} Code <strong className="text-[var(--ink)]">{shortCode}</strong>.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The preview route never sends anything, so you can't message yourself from it. */}
          <Link href={`/app/modes/${active?.mode ?? 'basic'}/preview`} className="action-secondary"><Eye size={18} />Preview</Link>
          <Link href="/app/modes" className="action-secondary"><SquaresFour size={18} />Change mode</Link>
          {code.isLive
            ? <ConfirmForm action={toggleCode} tone="danger" title="Pause personal sharing?" message="Anyone scanning your QR will see an unavailable page until you turn sharing back on. Your Modes and responses stay in your workspace." confirmLabel="Pause sharing" triggerLabel={<><Pause size={18} weight="bold" />Pause sharing</>} triggerClassName="action-quiet"><input type="hidden" name="codeId" value={code.id} /><input type="hidden" name="enabled" value="false" /></ConfirmForm>
            : <GoLiveDialog codeId={code.id} modeName={active ? modeName(active.mode) : 'Basic'} modeKey={active?.mode ?? 'basic'} question={home.liveQuestion} />}
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
                {items.length === 0 ? <EmptyInbox filter={filter} /> : <InboxList items={items} />}
              </PendingRegion>
              {since && <p className="text-xs text-[var(--muted)]">The free plan shows responses from the last 30 days.</p>}
            </div>
          ) : (
            <PendingRegion>{insights && <Analytics data={insights} />}</PendingRegion>
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

const MODE_LABEL: Record<string, string> = { basic: 'Basic', networking: 'Networking', incognito: 'Incognito', creator: 'Creator', portfolio: 'Portfolio' }

function Analytics({ data }: { data: Insights }) {
  const max = Math.max(1, ...data.days.map((day) => day.visits))
  const change = percentChange(data.visits, data.previousVisits)
  const busiest = busiestDay(data.days)
  const overall = rate(data.responses, data.visits)
  const tiles = [
    { label: 'Page visits', value: String(data.visits), note: change === null ? `Last ${data.range} days` : `${change >= 0 ? '+' : ''}${change}% vs previous ${data.range} days` },
    { label: 'Responses', value: String(data.responses), note: overall === null ? 'No visits yet' : `${overall}% of visits` },
    { label: 'Link clicks', value: String(data.clicks), note: 'Clicks to your chosen links' },
    { label: 'Response rate', value: overall === null ? '–' : `${overall}%`, note: 'Responses ÷ visits' },
  ]
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">What brings people to your personal page, and what they do next.</p>
        <nav aria-label="Date range" className="flex gap-1 rounded-xl border border-[var(--line)] p-1">
          {([7, 30] as const).map((r) => <PendingLink key={r} href={`/app?view=analytics&range=${r}`} current={data.range === r} className={`rounded-lg px-4 py-1.5 text-sm font-bold ${data.range === r ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--muted)]'}`}>{r} days</PendingLink>)}
        </nav>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">{tiles.map((tile) => <article key={tile.label} className="soft-card p-3 sm:p-5"><p className="text-xs text-[var(--muted)]">{tile.label}</p><p className="mt-2 text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">{tile.value}</p><p className="mt-2 text-[11px] text-[var(--muted)] sm:text-xs">{tile.note}</p></article>)}</div>
      <article className="soft-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold tracking-[-.03em]">Visits and responses</h3><p className="mt-1 text-xs text-[var(--muted)]">Page visits, not confirmed physical scans. Darker part of each bar = days with responses.</p></div><span className="plan-badge">Last {data.range} days</span></div>
        <div className="mt-6 flex h-52 items-end gap-1 border-b border-[var(--line)] sm:gap-2" role="img" aria-label={`Visits per day: ${data.days.map((d) => `${d.label} ${d.visits}`).join(', ')}`}>
          {data.days.map((day) => (
            <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2 text-center">
              <div className="flex h-full w-full items-end"><div className={`w-full rounded-t-md ${day.visits === max && day.visits > 0 ? 'bg-[var(--accent)]' : day.responses > 0 ? 'bg-[var(--accent-strong)] opacity-70' : 'bg-[var(--surface-muted)]'}`} style={{ height: `${Math.max(4, (day.visits / max) * 100)}%` }} title={`${day.label}: ${day.visits} visits, ${day.responses} responses`} /></div>
              {data.range === 7 && <span className="pb-2 text-xs font-bold text-[var(--muted)]">{day.label}</span>}
            </div>
          ))}
        </div>
        {busiest && <p className="mt-4 rounded-xl bg-[var(--accent-soft)] p-3 text-sm"><strong>{busiest.label} was your busiest day</strong> <span className="text-[var(--muted)]">· {busiest.visits} visits · {busiest.responses} responses</span></p>}
      </article>
      <article className="soft-card p-5 sm:p-6">
        <h3 className="text-lg font-extrabold tracking-[-.03em]">Which Modes connect?</h3>
        {data.modes.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">Visits will show up here once someone opens your page.</p> : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs text-[var(--muted)]"><tr><th className="py-2 font-bold">Mode</th><th className="py-2 text-right font-bold">Visits</th><th className="py-2 text-right font-bold">Responses</th><th className="py-2 text-right font-bold">Response rate</th></tr></thead>
            <tbody>{data.modes.map((m) => <tr key={m.mode} className="border-t border-[var(--line)]"><td className="py-2.5 font-bold">{MODE_LABEL[m.mode] ?? m.mode}</td><td className="py-2.5 text-right tabular-nums">{m.visits}</td><td className="py-2.5 text-right tabular-nums">{m.responses}</td><td className="py-2.5 text-right tabular-nums">{rate(m.responses, m.visits) === null ? '–' : `${rate(m.responses, m.visits)}%`}</td></tr>)}</tbody>
          </table>
        )}
      </article>
    </div>
  )
}
