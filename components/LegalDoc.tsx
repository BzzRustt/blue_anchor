import type { ReactNode } from 'react'
import { MarketingFooter } from '@/components/MarketingFooter'
import { MarketingHeader } from '@/components/MarketingHeader'
import { LEGAL } from '@/lib/legal'

export function LegalDoc({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <>
      <MarketingHeader />
      <main className="site-shell py-10">
        <article className="mx-auto grid max-w-3xl gap-6 text-[15px] leading-7 text-[var(--muted)] [&_a]:font-semibold [&_a]:text-[var(--accent-strong)] [&_a]:underline [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:text-[var(--ink)] [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-[var(--ink)]">
          <header>
            <h1 className="text-4xl font-extrabold tracking-[-.05em] text-[var(--ink)] md:text-5xl">{title}</h1>
            <p className="mt-3 text-sm text-[var(--faint)]">Last updated {LEGAL.lastUpdated}</p>
            <p className="mt-4 text-base">{intro}</p>
          </header>
          {children}
        </article>
      </main>
      <MarketingFooter />
    </>
  )
}
