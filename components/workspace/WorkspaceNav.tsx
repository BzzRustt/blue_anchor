'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarBlank, House, SquaresFour, Storefront, UserCircle } from '@phosphor-icons/react'

// The five tabs from the spec. Old routes (/app/inbox, /app/insights, /app/code, /app/campaigns)
// redirect here via next.config.mjs, so bookmarks keep working.
const items = [
  { href: '/app', label: 'Home', icon: House },
  { href: '/app/modes', label: 'Modes', icon: SquaresFour },
  { href: '/app/events', label: 'Events', icon: CalendarBlank },
  { href: '/app/shop', label: 'Shop', icon: Storefront },
  { href: '/app/profile', label: 'Profile', icon: UserCircle },
] as const

/** "Workspace / Home" in the top bar: the tab is the first path segment after /app. */
export function WorkspaceCrumb() {
  const pathname = usePathname()
  const tab = items.find((item) => item.href !== '/app' && (pathname === item.href || pathname.startsWith(`${item.href}/`))) ?? items[0]
  return <p className="text-sm text-[var(--muted)]">Workspace <span aria-hidden="true" className="mx-1.5">/</span> <span className="font-bold text-[var(--ink)]">{tab.label}</span></p>
}

export function WorkspaceNav({ mobile = false, unread = 0 }: { mobile?: boolean; unread?: number }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Workspace" className={mobile ? 'grid grid-cols-5 gap-1 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2' : 'grid gap-1'}>
      {items.map((item) => {
        const active = item.href === '/app' ? pathname === '/app' : pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon
        const count = item.href === '/app' ? unread : 0
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={mobile
              ? `relative grid min-h-[52px] place-items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-bold ${active ? 'bg-[var(--lime)] text-[var(--side-active)]' : 'text-[var(--side-ink)]'}`
              : `flex min-h-11 items-center gap-3 rounded-[9px] px-3 text-sm ${active ? 'bg-[var(--lime)] font-extrabold text-[var(--side-active)]' : 'font-semibold text-[var(--side-ink)] hover:bg-[var(--side-hover)] hover:text-white'}`}
          >
            <Icon size={mobile ? 21 : 19} weight={active ? 'bold' : 'regular'} />
            <span>{item.label}</span>
            {count > 0 && (
              <>
                <span className="sr-only">, {count} unread</span>
                <span aria-hidden="true" className={mobile ? 'absolute right-[18%] top-0.5 grid h-4 min-w-4 place-items-center rounded-[5px] bg-[var(--lime)] px-1 text-[10px] font-extrabold text-[var(--on-lime)]' : 'ml-auto min-w-[22px] rounded-[5px] bg-[var(--lime)] px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--on-lime)]'}>{count > 99 ? '99+' : count}</span>
              </>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
