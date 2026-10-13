import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { HowDemo } from '@/components/HowDemo'
import { MarketingFooter } from '@/components/MarketingFooter'
import { MarketingHeader } from '@/components/MarketingHeader'

export const metadata: Metadata = { title: 'How it works' }

export default function HowItWorksPage() {
  return <><MarketingHeader /><main><HowDemo /><section className="site-shell"><div className="grid items-center gap-6 rounded-[20px] bg-[var(--accent-soft)] p-8 md:grid-cols-[1fr_auto] md:p-12"><div><h2 className="text-4xl font-extrabold tracking-[-.055em]">Ready to make your code useful?</h2><p className="mt-3 text-[var(--muted)]">Create your profile, choose a campaign, and publish your first visitor experience.</p></div><Link className="action-primary" href="/signup">Start free <ArrowRight size={18} weight="bold" /></Link></div></section></main><MarketingFooter /></>
}
