import Image from 'next/image'
import { ArrowUpRight, InstagramLogo, LinkedinLogo, LinkSimple, Scan, SpotifyLogo, TiktokLogo, YoutubeLogo } from '@phosphor-icons/react/dist/ssr'
import { VisitorForm } from '@/components/VisitorForm'
import { MODE_INFO, visitorLinks, type ModeConfig, type ModeKey, type OwnerProfile, type VisitorLink } from '@/lib/modes'
import type { VisitorExperience } from '@/lib/product'

const SUBMIT_LABEL: Record<ModeKey, string> = { basic: 'Send privately', networking: 'Send introduction', incognito: 'Send privately', creator: 'Send', portfolio: 'Send enquiry' }
const SOCIAL_ICON: Record<string, typeof LinkSimple> = { instagram: InstagramLogo, linkedin: LinkedinLogo, tiktok: TiktokLogo, youtube: YoutubeLogo, spotify: SpotifyLogo }

type Props = {
  mode: ModeKey
  config: ModeConfig
  owner: OwnerProfile
  blocks: VisitorExperience['blocks']
  slug: string
  /** Owner's "See what others see": same page, nothing is recorded or sent. */
  preview?: boolean
}

/**
 * The public face of a Mode. One component so the preview is exactly what visitors get.
 * Incognito never touches `owner`: the profile is not rendered, linked or used in any text.
 */
export function VisitorPage({ mode, config, owner, blocks, slug, preview = false }: Props) {
  const links = visitorLinks(mode, config, owner)
  // Visitors are sent through /out so clicks are counted and the target is chosen by the server.
  // In preview the owner goes straight to the address instead, so their own taps are not counted.
  const href = (link: VisitorLink, index: number) => (preview ? link.url : `/api/t/${encodeURIComponent(slug)}/out?i=${index}`)
  const social = links.map((link, index) => ({ link, index })).filter(({ link }) => link.kind === 'social')
  const form = blocks.length > 0 ? <div className="mt-6"><VisitorForm slug={slug} blocks={blocks} preview={preview} submitLabel={SUBMIT_LABEL[mode]} /></div> : (preview ? null : <VisitorForm slug={slug} blocks={[]} />)

  return (
    <article className="mx-auto w-full max-w-[520px] overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-strong)] shadow-[var(--shadow)]">
      <div className="h-1.5 bg-[var(--accent)]" />
      <div className="p-5 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[var(--accent)]">{mode === 'incognito' ? 'Anonymous' : MODE_INFO[mode].name}</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold"><Scan size={16} className="text-[var(--accent)]" />scanme</span>
        </div>

        {mode === 'incognito' ? (
          <section className="mt-9 text-center">
            <h1 className="text-4xl font-extrabold tracking-[-.05em]">A question <span className="serif-accent">for you.</span></h1>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-[var(--muted)]">Answer if you like. Your answer goes privately to whoever shared this code.</p>
          </section>
        ) : (
          <Profile owner={owner} config={config} mode={mode} social={social} href={href} />
        )}

        {mode === 'creator' && <Creator config={config} links={links} href={href} />}
        {mode === 'portfolio' && <Portfolio config={config} links={links} href={href} />}
        {form}
      </div>
    </article>
  )
}

function Profile({ owner, config, mode, social, href }: { owner: OwnerProfile; config: ModeConfig; mode: ModeKey; social: Array<{ link: VisitorLink; index: number }>; href: (link: VisitorLink, index: number) => string }) {
  const initials = owner.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const on = (field: keyof ModeConfig['show']) => config.show[field] === true
  const role = [on('role') ? owner.role : null, on('company') ? owner.company : null].filter(Boolean).join(' at ')
  return (
    <section className="mt-7 text-center">
      {on('photo') && <div className="relative mx-auto grid h-24 w-24 place-items-center overflow-hidden rounded-full border-4 border-[var(--surface-strong)] bg-[var(--accent)] text-2xl font-extrabold text-[var(--on-accent)] shadow-lg">{owner.image ? <Image src={owner.image} alt="" fill sizes="96px" className="object-cover" unoptimized /> : initials}</div>}
      <h1 className="mt-4 text-3xl font-extrabold tracking-[-.05em]">{owner.name}</h1>
      {role && <p className="mt-1 text-sm font-bold text-[var(--accent)]">{role}</p>}
      {on('bio') && owner.bio && <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--muted)]">{owner.bio}</p>}
      {mode === 'networking' && (
        <div className="mt-5 grid gap-2 text-left">
          {on('looking') && owner.lookingFor && <Fact label="Looking for" text={owner.lookingFor} />}
          {on('offer') && owner.canOffer && <Fact label="Can help with" text={owner.canOffer} />}
          {on('interests') && owner.interests && <Fact label="Interests" text={owner.interests} />}
        </div>
      )}
      {social.length > 0 && <div className="mt-5 flex flex-wrap justify-center gap-2">{social.map(({ link, index }) => { const Icon = SOCIAL_ICON[link.key] ?? LinkSimple; return <a key={link.key} href={href(link, index)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-bold"><Icon size={18} />{link.label}</a> })}</div>}
    </section>
  )
}

const Fact = ({ label, text }: { label: string; text: string }) => <div className="rounded-xl bg-[var(--surface)] p-3"><p className="text-[11px] font-extrabold uppercase tracking-[.12em] text-[var(--accent)]">{label}</p><p className="mt-1 text-sm leading-6">{text}</p></div>

function Creator({ config, links, href }: { config: ModeConfig; links: VisitorLink[]; href: (link: VisitorLink, index: number) => string }) {
  const f = config.creator.featured
  const featuredIndex = links.findIndex((l) => l.kind === 'featured')
  const secondary = links.map((link, index) => ({ link, index })).filter(({ link }) => link.kind === 'link')
  return (
    <>
      {f.title && (
        <section className="mt-7 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          {f.imageUrl && <div className="relative aspect-[16/9] bg-[var(--surface-muted)]"><Image src={f.imageUrl} alt="" fill sizes="520px" className="object-cover" unoptimized /></div>}
          <div className="p-4">
            <p className="text-[11px] font-extrabold uppercase tracking-[.12em] text-[var(--accent)]">Featured</p>
            <h2 className="mt-1 text-xl font-extrabold tracking-[-.03em]">{f.title}</h2>
            {f.description && <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{f.description}</p>}
            {featuredIndex >= 0 && <a href={href(links[featuredIndex], featuredIndex)} target="_blank" rel="noopener noreferrer" className="action-primary mt-4 w-full">{f.button}<ArrowUpRight size={18} weight="bold" /></a>}
          </div>
        </section>
      )}
      {secondary.length > 0 && <div className="mt-3 grid gap-2">{secondary.map(({ link, index }) => <a key={link.key} href={href(link, index)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-between rounded-lg border border-[var(--line)] px-4 text-sm font-bold">{link.label}<ArrowUpRight size={16} /></a>)}</div>}
    </>
  )
}

function Portfolio({ config, links, href }: { config: ModeConfig; links: VisitorLink[]; href: (link: VisitorLink, index: number) => string }) {
  const { style, intro, projects } = config.portfolio
  const projectLink = (n: number) => { const index = links.findIndex((l) => l.key === `project${n + 1}`); return index >= 0 ? { link: links[index], index } : null }
  return (
    <>
      {intro && <p className="mx-auto mt-4 max-w-sm text-center text-sm leading-6">{intro}</p>}
      {projects.length > 0 && (
        <section className="mt-7 grid gap-3" aria-label="Projects">
          {projects.map((project, n) => {
            const target = projectLink(n)
            const body = (
              <>
                {project.imageUrl && <div className={`relative bg-[var(--surface-muted)] ${style === 'visual' ? 'aspect-[4/3]' : 'aspect-[16/7]'}`}><Image src={project.imageUrl} alt="" fill sizes="520px" className="object-cover" unoptimized /></div>}
                <div className="p-4"><h2 className="font-extrabold tracking-[-.02em]">{project.title}</h2>{project.description && style === 'professional' && <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{project.description}</p>}{target && <span className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-[var(--accent)]">View project<ArrowUpRight size={15} /></span>}</div>
              </>
            )
            const cls = 'block overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]'
            return target ? <a key={project.title + n} href={href(target.link, target.index)} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a> : <div key={project.title + n} className={cls}>{body}</div>
          })}
        </section>
      )}
    </>
  )
}
