import Link from 'next/link'
import Image from 'next/image'
import { and, eq, gte, isNull, sql } from 'drizzle-orm'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SignOutButton } from '@/components/workspace/SignOutButton'
import { WorkspaceCrumb, WorkspaceNav } from '@/components/workspace/WorkspaceNav'
import { schema, withOwnerDb } from '@/lib/db'
import { requireOwner } from '@/lib/owner'
import { historyCutoff } from '@/lib/plans'

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOwner()
  const userId = session.user.id

  // One transaction for what the shell needs: who you are and how many responses are waiting.
  const { owner, unread } = await withOwnerDb(userId, async (db) => {
    const [owner] = await db.select({ name: schema.users.name, plan: schema.users.plan, image: schema.users.image }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    const since = historyCutoff(owner?.plan ?? 'free')
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.responses)
      .where(and(eq(schema.responses.userId, userId), eq(schema.responses.archived, false), isNull(schema.responses.readAt), since ? gte(schema.responses.submittedAt, since) : undefined))
    return { owner, unread: count }
  })

  const name = owner?.name ?? session.user.name
  const initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const planLabel = owner?.plan && owner.plan !== 'free' ? 'Pro' : 'Free'

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[236px_1fr]">
      <aside className="hidden min-h-dvh border-r border-[var(--line)] bg-[var(--side)] px-5 pb-5 pt-8 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-9">
        <Link href="/" className="block w-fit rounded-md" aria-label="ScanMe home"><Brand /></Link>
        <WorkspaceNav unread={unread} />
        <div className="mt-auto grid gap-1 border-t border-[var(--line)] pt-3">
          <Link href="/app/profile" className="flex items-center gap-3 rounded-[9px] p-2 hover:bg-[var(--side-hover)]">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--surface-muted)] text-xs font-extrabold text-[var(--accent)]">{owner?.image ? <Image src={owner.image} alt="" fill sizes="36px" className="object-cover" unoptimized /> : initials}</span>
            <span className="min-w-0 text-sm font-bold leading-tight"><span className="block truncate">{name}</span><span className="block text-xs font-normal text-[var(--muted)]">{planLabel} account</span></span>
          </Link>
          <SignOutButton />
        </div>
      </aside>

      <div className="min-w-0 pb-28 lg:pb-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--page)_90%,transparent)] px-4 backdrop-blur-xl sm:px-7 lg:h-[68px] lg:px-11">
          <Link href="/" className="lg:hidden" aria-label="ScanMe home"><Brand /></Link>
          <span className="hidden lg:block"><WorkspaceCrumb /></span>
          <div className="flex items-center gap-2">
            <Link href="/plans" className="plan-badge hover:text-[var(--ink)]">{planLabel} plan</Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1180px] p-4 sm:p-7 lg:px-11 lg:py-9">{children}</main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--side)_96%,transparent)] shadow-[0_-8px_25px_rgba(26,41,27,.05)] backdrop-blur-xl lg:hidden"><WorkspaceNav mobile unread={unread} /></div>
    </div>
  )
}
