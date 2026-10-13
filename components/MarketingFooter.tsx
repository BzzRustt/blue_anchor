import Link from 'next/link'
import { Brand } from '@/components/Brand'

export function MarketingFooter() {
  return (
    <footer className="mt-20 bg-[#12372a] text-[#eff8f3]">
      <div className="site-shell grid gap-10 py-12 md:grid-cols-[1.4fr_.8fr_.8fr]">
        <div>
          <Brand inverse />
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#bdd2c6]">
            A permanent QR for the profile, question, or introduction you need right now.
          </p>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-bold">Explore</h2>
          <div className="grid gap-2 text-sm text-[#bdd2c6]">
            <Link href="/how-it-works">How it works</Link>
            <Link href="/plans">Plans</Link>
            <Link href="/signup">Create your code</Link>
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-bold">Support</h2>
          <div className="grid gap-2 text-sm text-[#bdd2c6]">
            <a href="mailto:hello@scanme.app">Contact us</a>
            <a href="mailto:feedback@scanme.app">Share feedback</a>
            <Link href="/login">Owner login</Link>
          </div>
        </div>
        <p className="text-xs text-[#9eb7aa] md:col-span-3">© {new Date().getFullYear()} ScanMe. Built for better introductions.</p>
      </div>
    </footer>
  )
}
