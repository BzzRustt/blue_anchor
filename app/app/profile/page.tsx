import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { ArrowSquareOut, Check, Eye } from '@phosphor-icons/react/dist/ssr'
import { deleteAccount, saveProfile } from '@/app/app/actions'
import { SignOutButton } from '@/components/workspace/SignOutButton'
import { PageIntro } from '@/components/workspace/PageIntro'
import { schema, withOwnerDb } from '@/lib/db'
import { MODE_INFO, type ModeKey } from '@/lib/modes'
import { requireOwner } from '@/lib/owner'
import { modeKey } from '@/lib/product'

function Group({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <fieldset className="grid gap-4 border-0 p-0 sm:grid-cols-2"><legend className="sm:col-span-2"><span className="block text-lg font-extrabold tracking-[-.03em]">{title}</span><span className="mt-1 block text-sm font-normal text-[var(--muted)]">{hint}</span></legend>{children}</fieldset>
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const query = await searchParams
  const session = await requireOwner()
  const { owner, code, live } = await withOwnerDb(session.user.id, async (db) => {
    const [[owner], [code], [live]] = await Promise.all([
      db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1),
      db.select().from(schema.codes).where(and(eq(schema.codes.userId, session.user.id), eq(schema.codes.kind, 'personal'))).limit(1),
      db.select({ mode: schema.campaigns.mode }).from(schema.campaigns).where(and(eq(schema.campaigns.userId, session.user.id), eq(schema.campaigns.status, 'live'))).limit(1),
    ])
    return { owner, code, live }
  })
  const active: ModeKey | null = live ? modeKey(live.mode) : null
  const input = (name: keyof typeof owner & string, label: string, placeholder?: string, type = 'text', span = false) => (
    <label className={`field-label ${span ? 'sm:col-span-2' : ''}`}>{label}<input className="field-input" type={type} name={name} defaultValue={(owner[name] as string | null) ?? ''} placeholder={placeholder} /></label>
  )

  return (
    <div className="grid gap-7">
      <PageIntro eyebrow="Account" title="Profile" body="Fill it out once. Each Mode shows only the details you choose." />
      {query.saved && <p role="status" className="flex items-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-bold"><Check size={18} weight="bold" />Profile saved.</p>}
      {query.error && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_32%,var(--line))] p-3 text-sm text-[var(--danger)]">{query.error === 'handle' ? 'That handle is already taken. Try another.' : query.error === 'confirm' ? 'To delete your account, type DELETE in the box.' : query.error === 'reauth' ? 'For your safety, sign out and sign in again, then delete your account within a day.' : 'Please check your details and try again.'}</p>}

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <form action={saveProfile} className="soft-card grid gap-8 p-5 sm:p-7">
          <Group title="Personal details" hint="The basics. Your name is always shown on Modes other than Incognito.">
            {input('name', 'Full name', undefined, 'text')}
            {input('handle', 'Handle', 'allen.builds')}
            <label className="field-label sm:col-span-2">Short bio<textarea className="field-textarea" name="bio" maxLength={240} defaultValue={owner.bio ?? ''} placeholder="What are you working on, and who would you like to meet?" /></label>
            {input('image', 'Profile photo link', 'https://...', 'url', true)}
          </Group>
          <Group title="Professional details" hint="Used by Networking and Portfolio Modes.">
            {input('role', 'Role', 'Product designer')}
            {input('company', 'Company or organisation', 'Studio or company')}
            {input('lookingFor', 'What I am looking for', 'Clients, a co-founder, advice', 'text', true)}
            {input('canOffer', 'What I can offer', 'Design reviews, introductions', 'text', true)}
            {input('interests', 'Interests', 'Typography, climate tech', 'text', true)}
          </Group>
          <Group title="Social and professional links" hint="Only the ones a Mode chooses to show are ever visible.">
            {input('instagram', 'Instagram', '@allen.builds')}
            {input('tiktok', 'TikTok', '@allen.builds')}
            {input('linkedin', 'LinkedIn', 'https://linkedin.com/in/...', 'url')}
            {input('youtube', 'YouTube', 'https://youtube.com/@...', 'url')}
            {input('spotify', 'Spotify', 'https://open.spotify.com/...', 'url')}
            {input('website', 'Website', 'https://yourwebsite.com', 'url')}
            {input('portfolioUrl', 'Portfolio link', 'https://yourportfolio.com', 'url', true)}
          </Group>
          <button className="action-primary w-fit">Save changes</button>
        </form>

        <aside className="grid content-start gap-4">
          <div className="deep-card p-5">
            <p className="relative text-[11px] font-extrabold uppercase tracking-[.16em] text-[var(--on-deep-muted)]">What visitors see</p>
            <h2 className="relative mt-3 text-xl font-extrabold tracking-[-.03em]">Your information. Your choice.</h2>
            <p className="relative mt-2 text-sm leading-6 text-[var(--on-deep-muted)]">Your {active ? MODE_INFO[active].name : 'active'} Mode decides which details are shared. Editing your profile never reveals a hidden field.</p>
            {active && <Link href={`/app/modes/${active}/preview`} className="action-secondary relative mt-4 w-full !border-white !bg-white !text-[var(--deep)]"><Eye size={18} />See what others see</Link>}
          </div>
          <div className="soft-card p-5"><h2 className="font-extrabold">Your plan</h2><p className="mt-2 text-3xl font-extrabold">{owner.plan === 'free' ? 'Free' : 'Pro'}</p><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{owner.plan === 'free' ? 'Basic, Networking and Incognito Modes. Pro adds Creator and Portfolio.' : 'Every Mode, including Creator and Portfolio.'}</p><Link href="/plans" className="action-secondary mt-5 w-full">Compare plans <ArrowSquareOut size={17} /></Link></div>
          <div className="soft-card p-5"><h2 className="font-extrabold">Account</h2><p className="mt-2 break-all text-sm text-[var(--muted)]">{owner.email}</p><div className="mt-4"><SignOutButton /></div></div>
          <div className="soft-card grid gap-3 p-5">
            <h2 className="font-extrabold">Your data</h2>
            <a href="/app/export" className="action-secondary w-full justify-center">Download my data</a>
            <details className="text-sm">
              <summary className="cursor-pointer font-bold text-[var(--danger)]">Delete my account</summary>
              <form action={deleteAccount} className="mt-3 grid gap-3">
                <p className="leading-6 text-[var(--muted)]">This permanently deletes your account, your code, Modes, responses, and every event you organise with its attendees. It cannot be undone. Download your data first if you want a copy.</p>
                <label className="field-label">Type DELETE to confirm<input className="field-input" name="confirm" required autoComplete="off" /></label>
                <button className="rounded-full bg-[var(--danger)] px-4 py-2.5 font-bold text-white">Delete my account</button>
              </form>
            </details>
          </div>
          {code && <a className="action-secondary" target="_blank" rel="noreferrer" href={`/t/${code.slug}`}>Open visitor page <ArrowSquareOut size={17} /></a>}
        </aside>
      </div>
    </div>
  )
}
