import Image from 'next/image'
import { InstagramLogo, LinkedinLogo, LinkSimple, Scan } from '@phosphor-icons/react/dist/ssr'
import { notFound } from 'next/navigation'
import { VisitorForm } from '@/components/VisitorForm'
import { getVisitorExperience } from '@/lib/product'

function safeUrl(value: string | null) {
  if (!value) return null
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null } catch { return null }
}

export default async function VisitorPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const experience = await getVisitorExperience(code)
  if (!experience) notFound()
  const { owner, campaign, blocks } = experience
  const initials = owner.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const instagram = owner.instagram ? `https://instagram.com/${owner.instagram.replace(/^@/, '')}` : null
  const linkedin = safeUrl(owner.linkedin)
  const website = safeUrl(owner.website)

  return <main className="min-h-dvh bg-[var(--accent-soft)] px-4 py-6 sm:grid sm:place-items-center sm:py-10"><article className="mx-auto w-full max-w-[520px] overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface-strong)] shadow-[var(--shadow)]"><div className="h-2 bg-[var(--accent)]" /><div className="p-5 sm:p-8"><div className="flex items-start justify-between gap-4"><span className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--accent-strong)]">{campaign.mode.replace('_', ' ')}</span><span className="inline-flex items-center gap-1.5 text-xs font-extrabold"><Scan size={16} className="text-[var(--accent)]" />scanme</span></div><section className="mt-7 text-center"><div className="relative mx-auto grid h-24 w-24 place-items-center overflow-hidden rounded-full border-4 border-[var(--surface-strong)] bg-[var(--accent)] text-2xl font-extrabold text-white shadow-lg">{owner.image ? <Image src={owner.image} alt="" fill sizes="96px" className="object-cover" unoptimized /> : initials}</div><h1 className="mt-4 text-3xl font-extrabold tracking-[-.055em]">{owner.name}</h1>{(owner.role || owner.company) && <p className="mt-1 text-sm font-bold text-[var(--accent-strong)]">{[owner.role, owner.company].filter(Boolean).join(' at ')}</p>}{owner.bio && <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--muted)]">{owner.bio}</p>}<div className="mt-4 flex justify-center gap-2">{instagram && <a className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface)]" aria-label="Instagram" href={instagram} target="_blank" rel="noreferrer"><InstagramLogo size={19} /></a>}{linkedin && <a className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface)]" aria-label="LinkedIn" href={linkedin} target="_blank" rel="noreferrer"><LinkedinLogo size={19} /></a>}{website && <a className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface)]" aria-label="Website" href={website} target="_blank" rel="noreferrer"><LinkSimple size={19} /></a>}</div></section><div className="mt-7"><VisitorForm slug={code} blocks={blocks} /></div></div></article></main>
}
