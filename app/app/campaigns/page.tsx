import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { ArrowRight, Megaphone, Plus } from '@phosphor-icons/react/dist/ssr'
import { publishCampaign } from '@/app/app/actions'
import { PageIntro } from '@/components/workspace/PageIntro'
import { schema, withOwnerDb } from '@/lib/db'
import { requireOwner } from '@/lib/owner'

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ limit?: string }> }) {
  const session = await requireOwner()
  const query = await searchParams
  const campaigns = await withOwnerDb(session.user.id, (db) => db.select().from(schema.campaigns).where(eq(schema.campaigns.userId, session.user.id)).orderBy(desc(schema.campaigns.createdAt)))

  return (
    <div className="grid gap-7">
      <PageIntro eyebrow="Change the intent" title="Campaigns" body="Save different versions of your ScanMe experience, then choose which one is live behind your permanent code." action={<Link href="/app/campaigns/new" className="action-primary"><Plus size={18} weight="bold" />New campaign</Link>} />
      {query.limit && <div className="flex flex-col gap-3 rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft)] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-extrabold">You have reached the free plan limit</p><p className="mt-1 text-sm text-[var(--muted)]">Pro gives you unlimited saved campaigns and more live codes.</p></div><Link className="action-primary" href="/plans">Compare plans <ArrowRight size={17} /></Link></div>}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {campaigns.map((campaign) => <article key={campaign.id} className="soft-card flex min-h-64 flex-col p-5"><div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><Megaphone size={22} /></span><span className={campaign.status === 'live' ? 'status-live' : 'status-draft'}>{campaign.status === 'live' ? 'Live now' : campaign.status}</span></div><h2 className="mt-7 text-xl font-extrabold tracking-[-.035em]">{campaign.name}</h2><p className="mt-2 text-sm capitalize text-[var(--muted)]">{campaign.mode.replace('_', ' ')} mode</p><p className="mt-1 text-xs text-[var(--faint)]">Created {campaign.createdAt.toLocaleDateString('en-GB', { dateStyle: 'medium' })}</p><div className="mt-auto pt-6">{campaign.status !== 'live' ? <form action={publishCampaign}><input type="hidden" name="campaignId" value={campaign.id} /><button className="action-secondary w-full">Make this live</button></form> : <p className="rounded-xl bg-[var(--surface)] p-3 text-center text-xs font-bold text-[var(--accent-strong)]">Visitors see this campaign</p>}</div></article>)}
      </section>
    </div>
  )
}
