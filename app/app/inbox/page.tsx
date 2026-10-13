import { and, desc, eq } from 'drizzle-orm'
import { Archive, ChatCircleDots, Eye, QrCode } from '@phosphor-icons/react/dist/ssr'
import { archiveResponse } from '@/app/app/actions'
import { PageIntro } from '@/components/workspace/PageIntro'
import { db, schema } from '@/lib/db'
import { requireOwner } from '@/lib/owner'
import { answerText, ownerSummary } from '@/lib/product'

export default async function InboxPage() {
  const session = await requireOwner()
  const [items, summary] = await Promise.all([
    db.select({ response: schema.responses, campaignName: schema.campaigns.name, mode: schema.campaigns.mode })
      .from(schema.responses)
      .leftJoin(schema.campaigns, eq(schema.campaigns.id, schema.responses.campaignId))
      .where(and(eq(schema.responses.userId, session.user.id), eq(schema.responses.archived, false)))
      .orderBy(desc(schema.responses.submittedAt)).limit(50),
    ownerSummary(session.user.id),
  ])

  return (
    <div className="grid gap-7">
      <PageIntro eyebrow="Responses" title="Inbox" body="Every answer from people who scan your code, in one private place." />
      <section className="grid gap-3 sm:grid-cols-3">
        {[{ label: 'Total scans', value: summary.scans, icon: QrCode }, { label: 'Responses', value: summary.responses, icon: ChatCircleDots }, { label: 'Response rate', value: `${summary.conversion}%`, icon: Eye }].map((item) => <article key={item.label} className="soft-card p-5"><item.icon size={21} className="text-[var(--accent)]" /><p className="mt-4 text-3xl font-extrabold tracking-[-.05em]">{item.value}</p><p className="mt-1 text-sm text-[var(--muted)]">{item.label}</p></article>)}
      </section>

      <section className="soft-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><h2 className="font-extrabold">Recent responses</h2><span className="text-xs font-bold text-[var(--muted)]">{summary.unread} unread</span></div>
        {items.length === 0 ? (
          <div className="grid min-h-64 place-items-center p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><ChatCircleDots size={24} /></span><h3 className="mt-4 font-extrabold">Your first response will land here</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">Share your code, then return here to read ratings and private messages.</p></div></div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {items.map(({ response, campaignName, mode }) => {
              const answers = Object.values(response.answers as Record<string, unknown>).map(answerText).filter(Boolean)
              return <article key={response.id} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{campaignName ?? 'Deleted campaign'}</h3>{mode && <span className="status-draft capitalize">{mode.replace('_', ' ')}</span>} {!response.readAt && <span className="status-live">New</span>}</div><div className="mt-3 grid gap-2">{answers.length ? answers.map((answer, index) => <p key={`${response.id}-${index}`} className="text-sm leading-6 text-[var(--muted)]">{answer}</p>) : <p className="text-sm text-[var(--faint)]">No written answer</p>}</div><time className="mt-3 block text-xs text-[var(--faint)]">{response.submittedAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</time></div><form action={archiveResponse}><input type="hidden" name="responseId" value={response.id} /><button className="action-secondary" title="Archive response"><Archive size={18} />Archive</button></form></article>
            })}
          </div>
        )}
      </section>
    </div>
  )
}
