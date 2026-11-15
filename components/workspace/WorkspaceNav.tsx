'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarCheck,
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
  { href: '/app/events', label: 'Events', icon: CalendarCheck },
  { href: '/app/insights', label: 'Insights', icon: ChartLineUp },
  { href: '/app/code', label: 'My code', icon: IdentificationCard },
  { href: '/app/shop', label: 'Shop', icon: Storefront },
  { href: '/app/profile', label: 'Profile', icon: UserCircle },
] as const

export function WorkspaceNav({ mobile = false, unread = 0 }: { mobile?: boolean; unread?: number }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Workspace" className={mobile ? 'grid grid-cols-7 gap-1 overflow-x-auto px-2 py-2' : 'grid gap-[3px]'}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon
        const count = item.href === '/app/inbox' ? unread : 0
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={mobile
              ? `relative grid min-w-[56px] place-items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-bold ${active ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-[var(--muted)]'}`
              : `flex min-h-11 items-center gap-2.5 rounded-[9px] px-2.5 text-sm font-semibold focus-visible:[outline-color:var(--lime)] ${active ? 'bg-[var(--side-hover)] text-[var(--lime)]' : 'text-[var(--side-ink)] hover:bg-[var(--side-hover)] hover:text-white'}`}
          >
            <Icon size={mobile ? 20 : 18} weight={active ? 'fill' : 'regular'} />
            <span>{item.label}</span>
            {count > 0 && (
              <>
                <span className="sr-only">, {count} unread</span>
                <span aria-hidden="true" className={mobile ? 'absolute right-2 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-extrabold text-[var(--on-accent)]' : 'ml-auto min-w-[23px] rounded-full bg-[#344d3e] px-[5px] py-[3px] text-center text-[11px] font-bold text-[#f4f7ec]'}>{count > 99 ? '99+' : count}</span>
              </>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
