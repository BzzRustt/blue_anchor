import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarCheck, Check, Sparkle, UsersThree } from '@phosphor-icons/react/dist/ssr'
import { MarketingHeader } from '@/components/MarketingHeader'
import { EVENT_PACKAGES, formatPence } from '@/lib/event-packages'

export const metadata: Metadata = { title: 'Plans' }

// Only what is built. Pro's price is an open decision (D4), so it is not shown as a number.
const plans = [
  { name: 'Free', price: '£0', unit: 'forever', note: 'One permanent code for everyday sharing.', features: ['Basic, Networking and Incognito Modes', 'Personal inbox with read, archive, report and block', 'Visits, responses and link clicks for the last 7 days', '30 days of response history'] },
  { name: 'Pro', price: 'Soon', unit: 'price to be confirmed', note: 'For people who share their work.', featured: true, features: ['Everything in Free', 'Creator and Portfolio Modes', 'Unlimited response history'] },
]

export default function PlansPage() {
  return (
    <>
      <MarketingHeader />
      <main className="site-shell flex min-h-[calc(100dvh-72px)] flex-col justify-center gap-12 py-10">
        <section>
          <h1 className="text-5xl font-extrabold leading-none tracking-[-.065em] md:text-7xl">Start free.</h1>
          <p className="mt-4 text-lg text-[var(--muted)]">One account for your personal code and your events. No ads, ever.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">Pro is not open yet. Everyone starts on Free.</p>
          <div className="mt-8 grid items-stretch gap-4 lg:grid-cols-2">
            {plans.map((plan) => (
              <article key={plan.name} className={`flex flex-col rounded-[20px] border p-7 md:p-8 ${plan.featured ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--shadow)]' : 'border-[var(--line)] bg-[var(--surface-strong)]'}`}>
                <span className={`grid h-14 w-14 place-items-center rounded-[16px] ${plan.featured ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--surface-muted)] text-[var(--accent-strong)]'}`}>{plan.featured ? <Sparkle size={26} weight="bold" /> : <UsersThree size={26} weight="bold" />}</span>
                <h2 className="mt-6 text-3xl font-extrabold">{plan.name}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{plan.note}</p>
                <div className="mt-6 flex items-end gap-2"><strong className="text-5xl font-extrabold tracking-[-.065em]">{plan.price}</strong><span className="pb-2 text-sm text-[var(--muted)]">{plan.unit}</span></div>
                <div className="mt-6 grid gap-3">{plan.features.map((feature) => <p key={feature} className="flex items-center gap-3 text-sm text-[var(--muted)]"><Check size={18} weight="bold" className="shrink-0 text-[var(--accent)]" />{feature}</p>)}</div>
                {!plan.featured && <Link className="action-secondary mt-auto pt-8" href="/signup">Start free</Link>}
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="flex items-center gap-3 text-3xl font-extrabold tracking-[-.04em]"><CalendarCheck size={30} weight="bold" className="text-[var(--accent)]" />Events: pay per event</h2>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">Create and preview an event for free. Pay once to publish it; the package sets how many attendees can join. Badges, check-in, attendee cards and networking are included.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {EVENT_PACKAGES.map((p) => (
              <article key={p.key} className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] p-6">
                <h3 className="font-extrabold">{p.name}</h3>
                <p className="mt-3 text-4xl font-extrabold tracking-[-.05em]">{formatPence(p.pricePence)}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">per event</p>
              </article>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--faint)]">Indicative prices, not final. Payments are not switched on yet.</p>
        </section>
      </main>
    </>
  )
}
