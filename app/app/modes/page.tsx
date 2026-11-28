import Link from 'next/link'
import { ArrowRight, Briefcase, Eye, Ghost, Handshake, IdentificationCard, Sparkle } from '@phosphor-icons/react/dist/ssr'
import { PageIntro } from '@/components/workspace/PageIntro'
import { MODE_INFO, MODE_KEYS, type ModeKey } from '@/lib/modes'
import { requireOwner } from '@/lib/owner'
import { ownerSummary } from '@/lib/product'

const ICON: Record<ModeKey, typeof Sparkle> = { basic: IdentificationCard, networking: Handshake, incognito: Ghost, creator: Sparkle, portfolio: Briefcase }

export default async function ModesPage() {
  const session = await requireOwner()
  // Already loaded by the layout for this request, so no extra database work.
  const { plan, active: live, code } = await ownerSummary(session.user.id)
  const isPro = plan !== 'free'
  const activeKey = live && (MODE_KEYS as readonly string[]).includes(live.mode) ? (live.mode as ModeKey) : null

  return (
    <div className="grid gap-7">
      <PageIntro eyebrow="Your QR experience" title="Modes" body="One code. Five ways to show up. Choose what people see when they scan; your QR never changes." />

      <section className="deep-card p-6 sm:p-8" aria-label="Active Mode">
        <p className="relative text-[11px] font-extrabold uppercase tracking-[.16em] text-[var(--on-deep-muted)]">Active Mode · {code?.isLive ? 'Live on your QR' : 'Sharing paused'}</p>
        <h2 className="relative mt-3 text-3xl font-extrabold tracking-[-.05em]">{activeKey ? MODE_INFO[activeKey].name : live ? live.name : 'No Mode'} <span className="serif-accent text-[var(--lime)]">is on.</span></h2>
        <p className="relative mt-2 max-w-lg text-sm leading-6 text-[var(--on-deep-muted)]">{activeKey ? MODE_INFO[activeKey].blurb : 'Pick a Mode below to decide what people see.'} Switching Modes never changes your QR and never turns paused sharing back on.</p>
        <div className="relative mt-5 flex flex-wrap gap-2">
          {activeKey && <Link href={`/app/modes/${activeKey}/preview`} className="action-secondary !border-white !bg-white !text-[var(--deep)]"><Eye size={18} />See what others see</Link>}
          <Link href="/app" className="action-secondary !border-white/50 !bg-transparent !text-white hover:!bg-white/10">Show my QR</Link>
        </div>
      </section>

      <section aria-labelledby="choose">
        <div className="mb-4 flex items-end justify-between gap-3"><h2 id="choose" className="text-xl font-extrabold tracking-[-.03em]">Choose a Mode</h2><p className="text-xs text-[var(--muted)]">3 free · 2 Pro</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODE_KEYS.map((key) => {
            const info = MODE_INFO[key]; const Icon = ICON[key]; const active = key === activeKey
            return (
              <Link key={key} href={`/app/modes/${key}`} className={`soft-card group flex min-h-48 flex-col p-5 transition hover:border-[var(--accent)] ${active ? 'border-[var(--accent)]' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Icon size={23} /></span>
                  {active ? <span className="status-live">Active</span> : info.pro ? <span className="plan-badge !bg-[var(--deep)] !text-[var(--lime)]">Pro</span> : <span className="plan-badge">Free</span>}
                </div>
                <h3 className="mt-5 text-xl font-extrabold tracking-[-.03em]">{info.name}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{info.blurb}</p><p className="mt-2 text-xs leading-5 text-[var(--faint)]">Best for: {info.bestFor}</p>
                <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-bold text-[var(--accent)]">{info.pro && !isPro ? 'Preview' : 'Customise'}<ArrowRight size={16} className="transition group-hover:translate-x-0.5" /></span>
              </Link>
            )
          })}
        </div>
        <p className="mt-4 text-sm text-[var(--muted)]">Your profile holds your information. Your Mode decides what visitors see. Incognito never shows your identity.</p>
      </section>
    </div>
  )
}
