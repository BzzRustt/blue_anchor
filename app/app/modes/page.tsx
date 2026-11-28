import Link from 'next/link'
import { ArrowRight, Briefcase, Eye, Ghost, Handshake, IdentificationCard, Sparkle } from '@phosphor-icons/react/dist/ssr'
import { activateMode } from '@/app/app/modes/actions'
import { ConfirmForm } from '@/components/ConfirmForm'
import { VisitorPage } from '@/components/VisitorPage'
import { PageIntro } from '@/components/workspace/PageIntro'
import { ShowQrDialog } from '@/components/workspace/ShowQrDialog'
import { appBaseUrl } from '@/lib/event-queries'
import { getModeState } from '@/lib/mode-queries'
import { buildBlocks, isModeKey, MODE_INFO, MODE_KEYS, type ModeKey } from '@/lib/modes'
import { canActivateMode, type Plan } from '@/lib/plans'
import { requireOwner } from '@/lib/owner'
import { ownerSummary } from '@/lib/product'
import type { VisitorExperience } from '@/lib/product'

const ICON: Record<ModeKey, typeof Sparkle> = { basic: IdentificationCard, networking: Handshake, incognito: Ghost, creator: Sparkle, portfolio: Briefcase }
const TAGLINE: Record<ModeKey, string> = {
  basic: 'A simple hello.',
  networking: 'Make the next connection.',
  incognito: 'Collect feedback without showing your identity.',
  creator: 'Share your latest work and socials.',
  portfolio: 'Show your work. Invite enquiries.',
}

export default async function ModesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const session = await requireOwner()
  const query = await searchParams
  // Already loaded by the layout for this request, so no extra database work.
  const { plan, active: live, code } = await ownerSummary(session.user.id)
  const isPro = plan !== 'free'
  const activeKey = live && isModeKey(live.mode) ? live.mode : null
  const selected: ModeKey = query.m && isModeKey(query.m) ? query.m : (activeKey ?? 'basic')
  const info = MODE_INFO[selected]

  // The preview beside the list is the same page a visitor gets, drawn from this Mode's saved settings (or its defaults).
  const state = await getModeState(session.user.id, selected)
  const blocks = (state.campaign
    ? state.blocks.map((b) => ({ ...b, config: b.config as VisitorExperience['blocks'][number]['config'] }))
    : buildBlocks(selected, state.config).map((b, i) => ({ id: `preview-${i}`, campaignId: '', position: i, required: b.required, type: b.type, config: b.config, createdAt: new Date() }))) as VisitorExperience['blocks']
  const canUse = canActivateMode(plan as Plan, selected).ok
  const qrUrl = code ? `${appBaseUrl()}/t/${code.slug}` : ''

  return (
    <div className="grid gap-6">
      <PageIntro eyebrow="Your QR experience" title="Choose how you show up" body="One QR. Choose what people see when they scan. Your QR never changes." />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
        <p className="flex items-center gap-3 text-sm"><span className={code?.isLive ? 'status-live' : 'status-draft'}>{code?.isLive ? 'Live on your QR' : 'Sharing paused'}</span><strong className="text-base">{activeKey ? MODE_INFO[activeKey].name : live ? live.name : 'No Mode chosen'}</strong></p>
        <Link href="/app" className="text-sm font-bold text-[var(--accent)] underline">{code?.isLive ? 'Pause sharing on Home' : 'Turn sharing on from Home'}</Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section aria-labelledby="choose" className="grid content-start gap-3">
          <div className="flex items-end justify-between gap-3"><h2 id="choose" className="text-xl font-extrabold tracking-[-.03em]">Your Modes</h2><p className="text-xs text-[var(--muted)]">3 free · 2 Pro</p></div>
          {MODE_KEYS.map((key) => {
            const m = MODE_INFO[key]; const Icon = ICON[key]; const isActive = key === activeKey; const isSel = key === selected
            return (
              <Link key={key} href={`/app/modes?m=${key}`} scroll={false} aria-current={isSel ? 'true' : undefined} className={`soft-card flex items-center gap-4 p-4 transition hover:border-[var(--accent)] ${isSel ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : ''}`}>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--accent)]"><Icon size={24} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2"><strong className="text-lg tracking-[-.02em]">{m.name}</strong>{m.pro && <span className="plan-badge !bg-[var(--deep)] !text-[var(--lime)]">Pro</span>}{isActive && <span className="status-live">Live</span>}</span>
                  <span className="block text-sm text-[var(--muted)]">{TAGLINE[key]}</span>
                </span>
                <ArrowRight size={18} className="shrink-0 text-[var(--muted)]" />
              </Link>
            )
          })}
          <div className="soft-card flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-extrabold">Your permanent QR</p><p className="text-sm text-[var(--muted)]">Same code, whichever Mode you choose.</p></div>
            {code && <ShowQrDialog url={qrUrl} code={code.slug.toUpperCase()} triggerClassName="action-secondary" />}
          </div>
        </section>

        <aside aria-label={`${info.name} visitor preview`} className="grid content-start gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-strong)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-extrabold tracking-[-.03em]">Visitor preview</h2><span className="plan-badge">{info.name}</span></div>
          <div className="max-h-[640px] overflow-y-auto rounded-[var(--radius)] bg-[var(--surface-muted)] p-3 sm:p-4"><VisitorPage mode={selected} config={state.config} owner={state.owner} blocks={blocks} slug={state.code?.slug ?? ''} preview /></div>
          <p className="text-center text-xs text-[var(--muted)]">Preview only. Nothing here is sent or counted.</p>
          <p className="text-xs leading-5 text-[var(--muted)]"><strong className="text-[var(--ink)]">Best for:</strong> {info.bestFor}</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/app/modes/${selected}`} className="action-secondary flex-1 justify-center"><Eye size={18} />{info.pro && !isPro ? 'See details' : 'Customise'}</Link>
            {selected !== activeKey && canUse && <ConfirmForm action={activateMode} title={`Make ${info.name} your active Mode?`} message="Your permanent QR will open this Mode. The QR itself does not change, and paused sharing stays paused." confirmLabel="Activate Mode" triggerLabel={`Use ${info.name}`} triggerClassName="action-primary flex-1 justify-center"><input type="hidden" name="mode" value={selected} /></ConfirmForm>}
            {selected === activeKey && <span className="status-live self-center">This is your live Mode</span>}
            {!canUse && <Link href="/plans" className="action-primary flex-1 justify-center">Go Pro to use {info.name}</Link>}
          </div>
        </aside>
      </div>
    </div>
  )
}
