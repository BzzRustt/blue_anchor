'use client'

import { createContext, useContext, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

const PendingContext = createContext<{ pending: boolean; go: (href: string) => void }>({ pending: false, go: () => {} })

/** Navigation inside this area keeps the current screen and dims it until the next one is ready. */
export const usePendingNav = () => useContext(PendingContext)

export function PendingNav({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const go = (href: string) => start(() => router.push(href, { scroll: false }))
  return <PendingContext.Provider value={{ pending, go }}>{children}</PendingContext.Provider>
}

/** The content that changes. While loading it fades and announces busy to screen readers. */
export function PendingRegion({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { pending } = usePendingNav()
  return <div aria-busy={pending} className={`${className} transition-opacity duration-150 ${pending ? 'pointer-events-none opacity-50' : ''}`}>{children}</div>
}

/** A link that navigates through PendingNav (plain <a> without JavaScript). */
export function PendingLink({ href, children, className, current }: { href: string; children: ReactNode; className?: string; current?: boolean }) {
  const { go } = usePendingNav()
  return <a href={href} aria-current={current ? 'page' : undefined} className={className} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); go(href) }}>{children}</a>
}
