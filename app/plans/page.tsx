import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, Sparkle, UsersThree } from '@phosphor-icons/react/dist/ssr'
import { MarketingHeader } from '@/components/MarketingHeader'
import { PLAN_LIMITS } from '@/lib/plans'

export const metadata: Metadata = { title: 'Plans' }

const eventLine = (plan: keyof typeof PLAN_LIMITS) => {
  const { eventsPerYear, attendeesPerEvent } = PLAN_LIMITS[plan]
  return `${Number.isFinite(eventsPerYear) ? `${eventsPerYear} events a year` : 'Unlimited events'}, up to ${attendeesPerEvent} guests each`
}

const plans = [
  { name: 'Free', price: '£0', note: 'Run a small event and keep one permanent code.', features: [eventLine('free'), 'Plain numbered event tags', '1 code and 1 live campaign', '30 days of response history', 'Safety controls included'] },
  { name: 'Pro', price: '£9', note: 'For organisers and people whose plans keep changing.', featured: true, features: [eventLine('pro'), 'Role letters on event tags, like F-042', '3 codes and live campaigns', 'Unlimited response history', 'Replies, exports, and scheduling'] },
  { name: 'Studio', price: '£29', note: 'For teams, venues, and activations.', features: [eventLine('studio'), 'Role letters on event tags, like F-042', '25 codes and live campaigns', '3 workspace seats', 'Shared response inbox'] },
]

export default function PlansPage() {
  return <><MarketingHeader /><main className="site-shell flex min-h-[calc(100dvh-72px)] flex-col justify-center py-10"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><h1 className="text-5xl font-extrabold leading-none tracking-[-.065em] md:text-7xl">Start free. Pay for more control.</h1><p className="mt-4 text-lg text-[var(--muted)]">Every plan keeps the visitor experience fast, private, and ad-free.</p></div><span className="plan-badge">Monthly pricing</span></div><p className="mt-4 text-sm text-[var(--muted)]">Paid plans are not open yet. Everyone starts on Free.</p><div className="mt-8 grid items-stretch gap-4 lg:grid-cols-3">{plans.map((plan) => <article key={plan.name} className={`flex min-h-[520px] flex-col rounded-[20px] border p-7 md:p-8 ${plan.featured ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--shadow)]' : 'border-[var(--line)] bg-[var(--surface-strong)]'}`}><div className="flex items-start justify-between"><span className={`grid h-14 w-14 place-items-center rounded-[16px] ${plan.featured ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--surface-muted)] text-[var(--accent-strong)]'}`}>{plan.featured ? <Sparkle size={26} weight="bold" /> : <UsersThree size={26} weight="bold" />}</span>{plan.featured && <span className="status-live">Most popular</span>}</div><h2 className="mt-6 text-3xl font-extrabold">{plan.name}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-[var(--muted)]">{plan.note}</p><div className="mt-7 flex items-end gap-2"><strong className="text-6xl font-extrabold tracking-[-.065em]">{plan.price}</strong><span className="pb-2 text-sm text-[var(--muted)]">{plan.name === 'Free' ? 'forever' : '/ month'}</span></div><div className="mt-7 grid gap-3">{plan.features.map((feature) => <p key={feature} className="flex items-center gap-3 text-sm text-[var(--muted)]"><Check size={18} weight="bold" className="shrink-0 text-[var(--accent)]" />{feature}</p>)}</div><Link className={`mt-auto pt-8 ${plan.featured ? 'action-primary' : 'action-secondary'}`} href="/signup">Start with {plan.name}</Link></article>)}</div></main></>
}
