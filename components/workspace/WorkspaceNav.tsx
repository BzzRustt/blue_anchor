'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChartLineUp,
  ChatCircleDots,
  IdentificationCard,
  Megaphone,
  Storefront,
  UserCircle,
} from '@phosphor-icons/react'

const items = [
  { href: '/app/inbox', label: 'Inbox', icon: ChatCircleDots },
  { href: '/app/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/app/insights', label: 'Insights', icon: ChartLineUp },
  { href: '/app/code', label: 'My code', icon: IdentificationCard },
  { href: '/app/shop', label: 'Shop', icon: Storefront },
  { href: '/app/profile', label: 'Profile', icon: UserCircle },
] as const

export function WorkspaceNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Workspace" className={mobile ? 'grid grid-cols-6 gap-1 overflow-x-auto px-2 py-2' : 'grid gap-1.5'}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={mobile
              ? `grid min-w-[56px] place-items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-bold ${active ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-[var(--muted)]'}`
              : `flex min-h-12 items-center gap-3 rounded-xl px-3 font-bold ${active ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]'}`}
          >
            <Icon size={mobile ? 20 : 21} weight={active ? 'fill' : 'regular'} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
