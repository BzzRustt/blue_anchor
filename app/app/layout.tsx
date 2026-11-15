import Link from 'next/link'
import Image from 'next/image'
import { and, eq, gte, isNull, sql } from 'drizzle-orm'
import { Scan } from '@phosphor-icons/react/dist/ssr'
import { Brand } from '@/components/Brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SignOutButton } from '@/components/workspace/SignOutButton'
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav'
import { schema, withOwnerDb } from '@/lib/db'
import { requireOwner } from '@/lib/owner'
import { historyCutoff } from '@/lib/plans'

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOwner()
  const userId = session.user.id

  // One transaction for everything the shell needs: who you are, how many responses are
  // waiting, and the link the "Scan preview" button opens.
  const { owner, unread, slug } = await withOwnerDb(userId, async (db) => {
    const [owner] = await db.select({ name: schema.users.name, plan: schema.users.plan, image: schema.users.image }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    const since = historyCutoff(owner?.plan ?? 'free')
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.responses)
      .where(and(eq(schema.responses.userId, userId), eq(schema.responses.archived, false), isNull(schema.responses.readAt), since ? gte(schema.responses.submittedAt, since) : undefined))
    const [code] = await db.select({ slug: schema.codes.slug }).from(schema.codes)
      .where(and(eq(schema.codes.userId, userId), eq(schema.codes.kind, 'personal'))).limit(1)
    return { owner, unread: count, slug: code?.slug }
  })

  const name = owner?.name ?? session.user.name
  const initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[224px_1fr]">
      <aside className="hidden min-h-dvh bg-[var(--side)] px-[15px] pb-4 pt-6 text-[var(--side-ink)] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <Link href="/" className="mx-2.5 mb-7 block w-fit rounded-md focus-visible:[outline-color:var(--lime)]" aria-label="ScanMe home"><Brand inverse /></Link>
        <p className="mx-3 mb-2 text-[11px] font-bold uppercase tracking-[.12em]">Workspace</p>
        <WorkspaceNav unread={unread} />
        <div className="mt-auto grid gap-1 border-t border-[var(--side-hover)] pt-3">
          <Link href="/app/profile" className="flex items-center gap-3 rounded-[9px] p-2 hover:bg-[var(--side-hover)] focus-visible:[outline-color:var(--lime)]">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--lime)] text-xs font-extrabold text-[var(--on-lime)]">{owner?.image ? <Image src={owner.image} alt="" fill sizes="36px" className="object-cover" unoptimized /> : initials}</span>
            <span className="min-w-0 text-sm font-semibold leading-tight text-white"><span className="block truncate">{name}</span><span className="block text-xs font-normal capitalize text-[var(--side-ink)]">{owner?.plan ?? 'free'} plan</span></span>
          </Link>
          <SignOutButton onDark />
        </div>
      </aside>

      <div className="min-w-0 pb-24 lg:pb-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--page)_90%,transparent)] px-4 backdrop-blur-xl sm:px-7 lg:h-[68px]">
          <Link href="/" className="lg:hidden" aria-label="ScanMe home"><Brand compact /></Link>
          <span className="hidden lg:block" aria-hidden="true" />
          <div className="flex items-center gap-2">
            {slug && <Link href={`/t/${slug}`} target="_blank" rel="noreferrer" className="action-secondary !min-h-10 !px-3 text-sm" aria-label="Scan preview, opens your visitor page in a new tab"><Scan size={18} weight="bold" /><span className="hidden sm:inline">Scan preview</span></Link>}
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1320px] p-4 sm:p-7 lg:px-11 lg:py-7">{children}</main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-strong)_94%,transparent)] backdrop-blur-xl lg:hidden"><WorkspaceNav mobile unread={unread} /></div>
    </div>
  )
}
