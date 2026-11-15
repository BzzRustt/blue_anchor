import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr'
import { VisitorPage } from '@/components/VisitorPage'
import { getModeState } from '@/lib/mode-queries'
import { buildBlocks, isModeKey, MODE_INFO } from '@/lib/modes'
import { requireOwner } from '@/lib/owner'
import type { VisitorExperience } from '@/lib/product'

export default async function ModePreview({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params
  if (!isModeKey(mode)) notFound()
  const session = await requireOwner()
  const { owner, config, blocks, campaign, code, active } = await getModeState(session.user.id, mode)

  // A saved Mode previews its saved questions. A Mode never saved previews the defaults.
  const shown = (campaign ? blocks.map((b) => ({ ...b, config: b.config as VisitorExperience['blocks'][number]['config'] })) : buildBlocks(mode, config).map((b, i) => ({ id: `preview-${i}`, campaignId: '', position: i, required: b.required, type: b.type, config: b.config, createdAt: new Date() }))) as VisitorExperience['blocks']

  return (
    <div className="grid gap-5">
      <Link href={`/app/modes/${mode}`} className="action-quiet w-fit !px-0"><ArrowLeft size={18} />Back to {MODE_INFO[mode].name}</Link>
      <header>
        <p className="overline">See what others see</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-.05em]">{MODE_INFO[mode].name} <span className="serif-accent">preview</span></h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">This is the page a visitor gets for this Mode. Nothing here is sent, counted or published.{!active && ' This Mode is not your active Mode yet.'}{code && !code.isLive && ' Sharing is paused, so visitors currently see an unavailable page.'}</p>
      </header>
      <div className="rounded-[var(--radius)] bg-[var(--surface-muted)] p-4 sm:p-8">
        <VisitorPage mode={mode} config={config} owner={owner} blocks={shown} slug={code?.slug ?? ''} preview />
      </div>
    </div>
  )
}
