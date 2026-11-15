import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { HowDemo } from '@/components/HowDemo'
import { MarketingFooter } from '@/components/MarketingFooter'
import { MarketingHeader } from '@/components/MarketingHeader'

export const metadata: Metadata = { title: 'How it works' }

export default function HowItWorksPage() {
  return <><MarketingHeader /><main><HowDemo /><section className="site-shell pb-8"><div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface-strong)] p-7 md:p-10"><p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--accent-strong)]">Running an event?</p><h2 className="mt-3 text-3xl font-extrabold tracking-[-.05em] md:text-4xl">A separate link, numbered tags, and cards guests fill in themselves.</h2><p className="mt-3 max-w-2xl text-[var(--muted)]">Create the event, add your guest list and print badges that carry each person&apos;s tag and a QR. Guests open their card from the badge or your link, answer your questions, and can edit or withdraw it until the event closes.</p><div className="mt-6 flex flex-wrap gap-3"><Link className="action-primary" href="/signup">Run an event <ArrowRight size={18} weight="bold" /></Link><Link className="action-secondary" href="/#events">What organisers get</Link></div></div></section><section className="site-shell"><div className="grid items-center gap-6 rounded-[20px] bg-[var(--accent-soft)] p-8 md:grid-cols-[1fr_auto] md:p-12"><div><h2 className="text-4xl font-extrabold tracking-[-.055em]">Ready to make your code useful?</h2><p className="mt-3 text-[var(--muted)]">Create your profile, choose a campaign, and publish your first visitor experience.</p></div><Link className="action-primary" href="/signup">Start free <ArrowRight size={18} weight="bold" /></Link></div></section></main><MarketingFooter /></>
}
