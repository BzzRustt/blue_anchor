import Link from 'next/link'
import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { Archive, ChatCircleDots, Check, Eye, QrCode } from '@phosphor-icons/react/dist/ssr'
import { archiveResponse, markResponseRead } from '@/app/app/actions'
import { historyCutoff } from '@/lib/plans'
import { PageIntro } from '@/components/workspace/PageIntro'
import { schema, withOwnerDb } from '@/lib/db'
import { requireOwner } from '@/lib/owner'
import { answerText, ownerSummary } from '@/lib/product'

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const session = await requireOwner()
  const query = await searchParams
  const filter = query.filter === 'unread' || query.filter === 'archived' ? query.filter : 'all'
  const shown = filter === 'archived'
    ? eq(schema.responses.archived, true)
    : filter === 'unread'
      ? and(eq(schema.responses.archived, false), isNull(schema.responses.readAt))
      : eq(schema.responses.archived, false)
  const [{ items, since }, summary] = await Promise.all([
    withOwnerDb(session.user.id, async (db) => {
      const [me] = await db.select({ plan: schema.users.plan }).from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1)
      const since = historyCutoff(me?.plan ?? 'free') // free plan: last 30 days only
      const items = await db.select({ response: schema.responses, campaignName: schema.campaigns.name, mode: schema.campaigns.mode })
        .from(schema.responses)
        .leftJoin(schema.campaigns, eq(schema.campaigns.id, schema.responses.campaignId))
        .where(and(eq(schema.responses.userId, session.user.id), shown, since ? gte(schema.responses.submittedAt, since) : undefined))
        .orderBy(desc(schema.responses.submittedAt)).limit(50)
      return { items, since }
    }),
    ownerSummary(session.user.id),
  ])

  return (
    <div className="grid gap-7">
      <PageIntro eyebrow="Responses" title="Inbox" body="Every answer from people who scan your code, in one private place." />
      <section className="grid gap-3 sm:grid-cols-3">
        {[{ label: 'Total scans', value: summary.scans, icon: QrCode }, { label: 'Responses', value: summary.responses, icon: ChatCircleDots }, { label: 'Response rate', value: `${summary.conversion}%`, icon: Eye }].map((item) => <article key={item.label} className="soft-card p-5"><item.icon size={21} className="text-[var(--accent)]" /><p className="mt-4 text-3xl font-extrabold tracking-[-.05em]">{item.value}</p><p className="mt-1 text-sm text-[var(--muted)]">{item.label}</p></article>)}
      </section>

      <section className="soft-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><h2 className="font-extrabold">Recent responses</h2><nav aria-label="Filter responses" className="flex gap-1">{([['all', 'Inbox'], ['unread', summary.unread ? `Unread (${summary.unread})` : 'Unread'], ['archived', 'Archived']] as const).map(([key, label]) => <Link key={key} href={key === 'all' ? '/app/inbox' : `/app/inbox?filter=${key}`} aria-current={filter === key ? 'page' : undefined} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${filter === key ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--muted)] hover:bg-[var(--surface-muted)]'}`}>{label}</Link>)}</nav></div>
        {items.length === 0 ? (
          <div className="grid min-h-64 place-items-center p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><ChatCircleDots size={24} /></span><h3 className="mt-4 font-extrabold">{filter === 'archived' ? 'Nothing archived' : filter === 'unread' ? 'You are all caught up' : 'Your first response will land here'}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">{filter === 'archived' ? 'Responses you archive are kept here.' : filter === 'unread' ? 'New responses will appear here.' : 'Share your code, then return here to read ratings and private messages.'}</p></div></div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {items.map(({ response, campaignName, mode }) => {
              const answers = Object.values(response.answers as Record<string, unknown>).map(answerText).filter(Boolean)
              return <article key={response.id} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{campaignName ?? 'Deleted campaign'}</h3>{mode && <span className="status-draft capitalize">{mode.replace('_', ' ')}</span>} {!response.readAt && <span className="status-live">New</span>}</div><div className="mt-3 grid gap-2">{answers.length ? answers.map((answer, index) => <p key={`${response.id}-${index}`} className="text-sm leading-6 text-[var(--muted)]">{answer}</p>) : <p className="text-sm text-[var(--faint)]">No written answer</p>}</div><time className="mt-3 block text-xs text-[var(--faint)]">{response.submittedAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</time></div>{filter !== 'archived' && <div className="flex flex-wrap gap-2">{!response.readAt && <form action={markResponseRead}><input type="hidden" name="responseId" value={response.id} /><button className="action-secondary" title="Mark as read"><Check size={18} />Mark read</button></form>}<form action={archiveResponse}><input type="hidden" name="responseId" value={response.id} /><button className="action-secondary" title="Archive response"><Archive size={18} />Archive</button></form></div>}</article>
            })}
          </div>
        )}
        {since && <p className="border-t border-[var(--line)] px-5 py-3 text-xs text-[var(--muted)]">The free plan shows responses from the last 30 days.</p>}
      </section>
    </div>
  )
}
