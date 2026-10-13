import Link from 'next/link'
import Image from 'next/image'
import { eq } from 'drizzle-orm'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SignOutButton } from '@/components/workspace/SignOutButton'
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav'
import { db, schema } from '@/lib/db'
import { requireOwner } from '@/lib/owner'

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOwner()
  const [owner] = await db.select({ name: schema.users.name, plan: schema.users.plan, image: schema.users.image }).from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1)
  const initials = (owner?.name ?? session.user.name).split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[252px_1fr]">
      <aside className="hidden min-h-dvh border-r border-[var(--line)] bg-[var(--surface-strong)] px-4 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <Link href="/"><Brand /></Link>
        <div className="mt-7 flex items-center gap-3 rounded-2xl bg-[var(--surface)] p-3">
          <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--accent)] text-sm font-extrabold text-white">{owner?.image ? <Image src={owner.image} alt="" fill sizes="44px" className="object-cover" unoptimized /> : initials}</span>
          <div className="min-w-0"><p className="truncate text-sm font-extrabold">{owner?.name ?? session.user.name}</p><span className="plan-badge mt-1 capitalize">{owner?.plan ?? 'free'} plan</span></div>
        </div>
        <div className="mt-6"><WorkspaceNav /></div>
        <div className="mt-auto border-t border-[var(--line)] pt-3"><SignOutButton /></div>
      </aside>

      <div className="min-w-0 pb-24 lg:pb-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--page)_88%,transparent)] px-4 backdrop-blur-xl sm:px-7 lg:h-[72px]">
          <Link href="/" className="lg:hidden"><Brand compact /></Link>
          <div className="hidden lg:block"><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--faint)]">Owner workspace</p></div>
          <div className="flex items-center gap-2"><span className="hidden text-sm font-bold text-[var(--muted)] sm:inline">{owner?.name ?? session.user.name}</span><ThemeToggle /></div>
        </header>
        <main className="mx-auto w-full max-w-[1260px] p-4 sm:p-7 lg:p-9">{children}</main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-strong)_94%,transparent)] backdrop-blur-xl lg:hidden"><WorkspaceNav mobile /></div>
    </div>
  )
}
