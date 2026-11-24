import Image from 'next/image'
import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { ArrowSquareOut, Check, Eye, GearSix } from '@phosphor-icons/react/dist/ssr'
import { openBilling, removePhoto, saveProfile, startPro, uploadPhoto } from '@/app/app/actions'
import { DirtyForm, SaveButton } from '@/components/DirtyForm'
import { proConfigured } from '@/lib/stripe'
import { SignOutButton } from '@/components/workspace/SignOutButton'
import { PageIntro } from '@/components/workspace/PageIntro'
import { PhotoUpload } from '@/components/workspace/PhotoUpload'
import { schema, withOwnerDb } from '@/lib/db'
import { MODE_INFO, type ModeKey } from '@/lib/modes'
import { requireOwner } from '@/lib/owner'
import { modeKey } from '@/lib/product'

const appHost = () => (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/^https?:\/\//, '').replace(/\/$/, '')

function Group({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <fieldset className="grid gap-4 border-0 p-0 sm:grid-cols-2"><legend className="sm:col-span-2"><span className="block text-lg font-extrabold tracking-[-.03em]">{title}</span><span className="mt-1 block text-sm font-normal text-[var(--muted)]">{hint}</span></legend>{children}</fieldset>
}

const ERRORS: Record<string, string> = {
  handle: 'That nickname is already taken. Try another.',
  payments: 'Payments are not available right now. Please try again later.',
  photo: 'Choose a photo to upload.',
  photo_size: 'That photo is too large. Use one under 5 MB.',
  photo_type: 'That file isn’t a photo we can use. Upload a JPEG, PNG or WebP image.',
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; detail?: string; pro?: string }> }) {
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
      {query.error && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_32%,var(--line))] p-3 text-sm text-[var(--danger)]">{query.error === 'nickname' && query.detail ? query.detail.slice(0, 120) : ERRORS[query.error] ?? 'Please check your details and try again.'}</p>}

      <section className="soft-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-7" aria-labelledby="photo-title">
        <span className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--surface-muted)] text-xl font-extrabold text-[var(--accent)]">{owner.image ? <Image src={owner.image} alt="Your profile photo" fill sizes="80px" className="object-cover" unoptimized /> : owner.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</span>
        <div className="grid flex-1 gap-2">
          <h2 id="photo-title" className="text-lg font-extrabold tracking-[-.03em]">Profile photo</h2>
          <p className="text-sm text-[var(--muted)]">JPEG, PNG or WebP, up to 5 MB. We crop it to a square and remove hidden details like location.</p>
          <div className="flex flex-wrap gap-2">
            <PhotoUpload action={uploadPhoto} />
            {owner.image && <form action={removePhoto}><button className="action-quiet">Remove photo</button></form>}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <DirtyForm action={saveProfile} className="soft-card grid gap-8 p-5 sm:p-7">
          <Group title="Personal details" hint="The basics. Your name is always shown on Modes other than Incognito.">
            {input('name', 'Full name', undefined, 'text')}
            <label className="field-label">Nickname <span className="font-normal text-[var(--faint)]">(optional)</span><input className="field-input" name="handle" maxLength={21} defaultValue={owner.handle ?? ''} placeholder="tito.builds" /><span className="text-xs font-normal text-[var(--muted)]">Gives you an easy link to share by typing: {appHost()}/@{owner.handle ?? 'nickname'}. It never works while Incognito is your live Mode. Your QR code doesn’t change.</span></label>
            <label className="field-label sm:col-span-2">Short bio<textarea className="field-textarea" name="bio" maxLength={240} defaultValue={owner.bio ?? ''} placeholder="What are you working on, and who would you like to meet?" /></label>
          </Group>
          <Group title="Professional details" hint="Used by Networking and Portfolio Modes.">
            {input('role', 'Role', 'Product designer')}
            {input('company', 'Company or organisation', 'Studio or company')}
            {input('lookingFor', 'What I am looking for (list several, separated by commas)', 'Clients, a co-founder, advice', 'text', true)}
            {input('canOffer', 'What I can help with (list several, separated by commas)', 'Design reviews, introductions', 'text', true)}
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
          <SaveButton />
        </DirtyForm>

        <aside className="grid content-start gap-4">
          <div className="deep-card p-5">
            <p className="relative text-[11px] font-extrabold uppercase tracking-[.16em] text-[var(--on-deep-muted)]">What visitors see</p>
            <h2 className="relative mt-3 text-xl font-extrabold tracking-[-.03em]">Your information. Your choice.</h2>
            <p className="relative mt-2 text-sm leading-6 text-[var(--on-deep-muted)]">Your {active ? MODE_INFO[active].name : 'active'} Mode decides which details are shared. Editing your profile never reveals a hidden field.</p>
            {active && <Link href={`/app/modes/${active}/preview`} className="action-secondary relative mt-4 w-full !border-white !bg-white !text-[var(--deep)]"><Eye size={18} />See what others see</Link>}
          </div>
          <div className="soft-card p-5"><h2 className="font-extrabold">Your plan</h2><p className="mt-2 text-3xl font-extrabold">{owner.plan === 'free' ? 'Free' : 'Pro'}</p><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{owner.plan === 'free' ? 'Basic, Networking and Incognito Modes. Pro adds Creator and Portfolio.' : 'Every Mode, including Creator and Portfolio.'}</p>{query.pro && owner.plan === 'free' && <p className="mt-3 text-sm font-bold text-[var(--accent-strong)]">Thanks. Pro switches on as soon as Stripe confirms the payment; refresh in a moment.</p>}{owner.plan === 'free' && proConfigured() && <form action={startPro} className="mt-5"><button className="action-primary w-full">Upgrade to Pro</button></form>}{owner.plan !== 'free' && owner.stripeCustomerId && <form action={openBilling} className="mt-5"><button className="action-secondary w-full">Manage or cancel Pro</button></form>}<Link href="/plans" className="action-secondary mt-3 w-full">Compare plans <ArrowSquareOut size={17} /></Link></div>
          <div className="soft-card p-5"><h2 className="font-extrabold">Account</h2><p className="mt-2 break-all text-sm text-[var(--muted)]">{owner.email}</p>{code && <p className="mt-2 text-sm text-[var(--muted)]">Your code <span className="font-mono font-bold text-[var(--ink)]">{code.slug.toUpperCase()}</span></p>}<div className="mt-4 grid gap-2"><Link href="/app/settings" className="action-secondary w-full justify-center"><GearSix size={17} />Settings, your data and account</Link><SignOutButton /></div></div>
        </aside>
      </div>
    </div>
  )
}
