import Link from 'next/link'
import Image from 'next/image'
import { GearSix } from '@phosphor-icons/react/dist/ssr'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SignOutButton } from '@/components/workspace/SignOutButton'
import { WorkspaceCrumb, WorkspaceNav } from '@/components/workspace/WorkspaceNav'
import { requireOwner } from '@/lib/owner'
import { ownerSummary } from '@/lib/product'

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOwner()
  // Shared with Home through the per-request cache: one database statement for both.
  const owner = await ownerSummary(session.user.id)
  const unread = owner.counts.unread

  const name = owner?.name ?? session.user.name
  const initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const planLabel = owner?.plan && owner.plan !== 'free' ? 'Pro' : 'Free'

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[236px_1fr]">
      <aside className="hidden min-h-dvh bg-[var(--side)] px-5 pb-5 pt-8 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-9">
        <Link href="/" className="block w-fit rounded-md" aria-label="ScanMe home"><Brand inverse /></Link>
        <WorkspaceNav unread={unread} />
        <div className="mt-auto grid gap-1 border-t border-white/15 pt-3 text-[var(--side-ink)]">
          <Link href="/app/profile" className="flex items-center gap-3 rounded-[9px] p-2 hover:bg-[var(--side-hover)]">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--lime)] text-xs font-extrabold text-[var(--on-lime)]">{owner?.image ? <Image src={owner.image} alt="" fill sizes="36px" className="object-cover" unoptimized /> : initials}</span>
            <span className="min-w-0 text-sm font-bold leading-tight text-white"><span className="block truncate">{name}</span><span className="block text-xs font-normal text-[var(--side-ink)]">{planLabel} account</span></span>
          </Link>
          <SignOutButton onDark />
        </div>
      </aside>

      <div className="min-w-0 pb-28 lg:pb-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--page)_90%,transparent)] px-4 backdrop-blur-xl sm:px-7 lg:h-[68px] lg:px-11">
          <Link href="/" className="lg:hidden" aria-label="ScanMe home"><Brand /></Link>
          <span className="hidden lg:block"><WorkspaceCrumb /></span>
          <div className="flex items-center gap-2">
            <Link href="/plans" className="plan-badge hover:text-[var(--ink)]">{planLabel} plan</Link>
            <Link href="/app/settings" aria-label="Settings" title="Settings" className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"><GearSix size={19} /></Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1180px] p-4 sm:p-7 lg:px-11 lg:py-9">{children}</main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[var(--side)] shadow-[0_-8px_25px_rgba(26,41,27,.12)] backdrop-blur-xl lg:hidden"><WorkspaceNav mobile unread={unread} /></div>
    </div>
  )
}
