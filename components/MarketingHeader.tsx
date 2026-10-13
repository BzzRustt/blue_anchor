import Link from 'next/link'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--page)_90%,transparent)] backdrop-blur-xl">
      <div className="site-shell flex h-[72px] items-center justify-between gap-4">
        <Link href="/" aria-label="ScanMe home"><Brand /></Link>
        <nav className="hidden items-center gap-1 rounded-[14px] border border-[var(--line)] bg-[var(--surface-muted)] p-1 md:flex" aria-label="Main navigation">
          <Link className="rounded-[10px] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-strong)]" href="/">Home</Link>
          <Link className="rounded-[10px] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-strong)]" href="/how-it-works">How it works</Link>
          <Link className="rounded-[10px] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-strong)]" href="/plans">Plans</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link className="action-quiet hidden sm:inline-flex" href="/login">Log in</Link>
          <Link className="action-primary" href="/signup">Sign up</Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
