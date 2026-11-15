import Link from 'next/link'
import QRCode from 'qrcode'
import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { Archive, ChatCircleDots, Check, Eye, Flag, Pause, Play, Prohibit, SquaresFour } from '@phosphor-icons/react/dist/ssr'
import { archiveResponse, blockSender, markResponseRead, reportResponse, toggleCode } from '@/app/app/actions'
import { ConfirmForm } from '@/components/ConfirmForm'
import { ShowQrDialog } from '@/components/workspace/ShowQrDialog'
import { schema, withOwnerDb } from '@/lib/db'
import { requireOwner } from '@/lib/owner'
import { answerText, homeData } from '@/lib/product'

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
  const home = await homeData(session.user.id)
  const { code, active, counts, days, since, campaigns } = home
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const url = `${baseUrl}/t/${code.slug}`
  const qr = await QRCode.toDataURL(url, { width: 720, margin: 2, color: { dark: '#10251a', light: '#ffffff' } })
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
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">{greeting(session.user.name)}</h1>
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
          <ShowQrDialog qr={qr} url={url} code={shortCode} triggerClassName="action-secondary !border-white !bg-white !text-[var(--deep)]" />
          <a href={`/t/${code.slug}`} target="_blank" rel="noreferrer" className="action-secondary !border-white/50 !bg-transparent !text-white hover:!bg-white/10"><Eye size={18} />Visitor preview</a>
          <Link href="/app/modes" className="action-quiet !text-[var(--lime)] hover:!bg-white/10"><SquaresFour size={18} />Switch Mode</Link>
          <span className="ml-auto">
            {code.isLive
              ? <ConfirmForm action={toggleCode} tone="danger" title="Pause personal sharing?" message="Anyone scanning your QR will see an unavailable page until you turn sharing back on. Your Modes and responses stay in your workspace." confirmLabel="Pause sharing" triggerLabel={<><Pause size={18} weight="bold" />Pause sharing</>} triggerClassName="action-quiet !text-white hover:!bg-white/10"><input type="hidden" name="codeId" value={code.id} /><input type="hidden" name="enabled" value="false" /></ConfirmForm>
              : <form action={toggleCode}><input type="hidden" name="codeId" value={code.id} /><input type="hidden" name="enabled" value="true" /><button className="action-secondary !border-[var(--lime)] !bg-[var(--lime)] !text-[var(--on-lime)]"><Play size={18} weight="bold" />Turn sharing on</button></form>}
          </span>
        </div>
      </section>

      <section aria-label="Inbox and analytics" className="grid gap-5">
        <nav aria-label="Home sections" className="flex gap-6 border-b border-[var(--line)]">
          {([['inbox', 'Personal inbox'], ['analytics', 'Audience insights']] as const).map(([key, label]) => <Link key={key} href={key === 'inbox' ? '/app' : '/app?view=analytics'} aria-current={view === key ? 'page' : undefined} className={`-mb-px border-b-2 px-1 pb-3 text-sm font-bold ${view === key ? 'border-[var(--accent)] text-[var(--ink)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'}`}>{label}</Link>)}
        </nav>
        {view === 'inbox'
          ? <Inbox userId={session.user.id} query={query} since={since} campaigns={campaigns} />
          : <Analytics days={days} visits={counts.visits30} responses={counts.responses30} clicks={counts.clicks30} />}
      </section>
    </div>
  )
}

async function Inbox({ userId, query, since, campaigns }: { userId: string; query: Search; since: Date | null; campaigns: Array<{ id: string; name: string; mode: string }> }) {
  const filter = query.filter === 'unread' || query.filter === 'archived' ? query.filter : 'all'
  const source = campaigns.some((c) => c.id === query.source) ? query.source! : ''
  const shown = filter === 'archived' ? eq(schema.responses.archived, true) : filter === 'unread' ? and(eq(schema.responses.archived, false), isNull(schema.responses.readAt)) : eq(schema.responses.archived, false)
  const items = await withOwnerDb(userId, (db) => db.select({ response: schema.responses, campaignName: schema.campaigns.name, mode: schema.campaigns.mode })
    .from(schema.responses)
    .leftJoin(schema.campaigns, eq(schema.campaigns.id, schema.responses.campaignId))
    .where(and(eq(schema.responses.userId, userId), shown, since ? gte(schema.responses.submittedAt, since) : undefined, source ? eq(schema.responses.campaignId, source) : undefined))
    .orderBy(desc(schema.responses.submittedAt)).limit(50))
  const href = (next: { filter?: string; source?: string }) => {
    const params = new URLSearchParams()
    const f = next.filter ?? filter; const s = next.source ?? source
    if (f !== 'all') params.set('filter', f)
    if (s) params.set('source', s)
    const qs = params.toString()
    return qs ? `/app?${qs}` : '/app'
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">Messages and responses through your personal QR only.</p>
        <form action="/app" className="flex items-center gap-2">
          {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
          <label htmlFor="source" className="sr-only">Filter by Mode</label>
          <select id="source" name="source" defaultValue={source} className="field-select !min-h-10 !w-auto text-sm"><option value="">All Modes</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} · {modeName(c.mode)}</option>)}</select>
          <button className="action-secondary !min-h-10">Filter</button>
        </form>
      </div>
      <nav aria-label="Filter responses" className="flex gap-2">
        {([['all', 'All'], ['unread', 'Unread'], ['archived', 'Archived']] as const).map(([key, label]) => <Link key={key} href={href({ filter: key })} aria-current={filter === key ? 'page' : undefined} className={`rounded-lg border px-3.5 py-1.5 text-sm font-bold ${filter === key ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted)] hover:text-[var(--ink)]'}`}>{label}</Link>)}
      </nav>
      <div className="soft-card overflow-hidden">
        {items.length === 0 ? (
          <div className="grid min-h-56 place-items-center p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><ChatCircleDots size={24} /></span><h3 className="mt-4 font-extrabold">{filter === 'archived' ? 'Nothing archived' : filter === 'unread' ? 'You are all caught up' : 'Your first response will land here'}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">{filter === 'archived' ? 'Responses you archive are kept here.' : filter === 'unread' ? 'New responses will appear here.' : 'Show your QR, then come back here to read ratings and private messages.'}</p></div></div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {items.map(({ response, campaignName, mode }) => {
              const answers = Object.values(response.answers as Record<string, unknown>).map(answerText).filter(Boolean)
              return (
                <li key={response.id} className="grid gap-3 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-start sm:p-5">
                  <span aria-hidden="true" className="hidden h-10 w-10 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--accent)] sm:grid"><ChatCircleDots size={20} /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{campaignName ?? 'Deleted Mode'}</h3>{!response.readAt && <span className="status-live">New</span>}{response.flagged && <span className="status-draft">Reported</span>}{response.blocked && <span className="status-draft">Sender blocked</span>}</div>
                    <div className="mt-1.5 grid gap-1">{answers.length ? answers.map((answer, index) => <p key={`${response.id}-${index}`} className="text-sm leading-6 text-[var(--muted)]">{answer}</p>) : <p className="text-sm text-[var(--muted)]">No written answer</p>}</div>
                    <p className="mt-2 text-xs text-[var(--muted)]">{mode ? modeName(mode) : 'Mode'} · Personal ScanMe · <time dateTime={response.submittedAt.toISOString()}>{response.submittedAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' })}</time></p>
                  </div>
                  {filter !== 'archived' && <div className="flex flex-wrap gap-2">{!response.readAt && <form action={markResponseRead}><input type="hidden" name="responseId" value={response.id} /><button className="action-secondary !min-h-10 text-sm"><Check size={17} />Mark read</button></form>}<form action={archiveResponse}><input type="hidden" name="responseId" value={response.id} /><button className="action-secondary !min-h-10 text-sm"><Archive size={17} />Archive</button></form>{!response.flagged && <form action={reportResponse}><input type="hidden" name="responseId" value={response.id} /><button className="action-quiet !min-h-10 text-sm" title="Report this response as abusive"><Flag size={17} />Report</button></form>}<ConfirmForm action={blockSender} tone="danger" title="Block this sender?" message="Further responses from this device or network will be refused. This can also affect other people on the same shared network. The response is archived." confirmLabel="Block sender" triggerLabel={<><Prohibit size={17} />Block</>} triggerClassName="action-quiet !min-h-10 text-sm"><input type="hidden" name="responseId" value={response.id} /></ConfirmForm></div>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {since && <p className="text-xs text-[var(--muted)]">The free plan shows responses from the last 30 days.</p>}
    </div>
  )
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
