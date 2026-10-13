import QRCode from 'qrcode'
import Image from 'next/image'
import { eq } from 'drizzle-orm'
import { ArrowSquareOut, IdentificationCard, Power } from '@phosphor-icons/react/dist/ssr'
import { toggleCode } from '@/app/app/actions'
import { CopyLinkButton } from '@/components/workspace/CopyLinkButton'
import { PageIntro } from '@/components/workspace/PageIntro'
import { db, schema } from '@/lib/db'
import { requireOwner } from '@/lib/owner'

export default async function CodePage() {
  const session = await requireOwner()
  const [code] = await db.select().from(schema.codes).where(eq(schema.codes.userId, session.user.id)).limit(1)
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const url = `${baseUrl}/t/${code.slug}`
  const qr = await QRCode.toDataURL(url, { width: 720, margin: 2, color: { dark: '#102018', light: '#ffffff' } })

  return <div className="grid gap-7"><PageIntro eyebrow="Permanent link" title="My code" body="Print it once. Change the campaign behind it whenever your context changes." /><section className="grid gap-5 lg:grid-cols-[minmax(300px,.72fr)_1.28fr]"><article className="soft-card grid place-items-center p-7"><div className="w-full max-w-[340px] rounded-[22px] bg-white p-5"><Image src={qr} alt={`QR code for ${url}`} width={720} height={720} unoptimized className="h-auto w-full" /></div></article><article className="soft-card p-5 sm:p-7"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><IdentificationCard size={25} /></span><h2 className="mt-6 text-2xl font-extrabold tracking-[-.045em]">{code.label ?? 'My ScanMe'}</h2><p className="mt-2 break-all text-sm text-[var(--muted)]">{url}</p><div className="mt-6 flex flex-wrap gap-3"><CopyLinkButton value={url} /><a href={url} target="_blank" rel="noreferrer" className="action-secondary">Preview <ArrowSquareOut size={18} /></a><a href={qr} download={`scanme-${code.slug}.png`} className="action-primary">Download PNG</a></div><div className="mt-8 border-t border-[var(--line)] pt-6"><div className="flex flex-col gap-4 rounded-2xl bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-extrabold">Code status</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Turn it off instantly without deleting responses or campaigns.</p></div><form action={toggleCode}><input type="hidden" name="codeId" value={code.id} /><input type="hidden" name="enabled" value={String(!code.isLive)} /><button className={code.isLive ? 'action-danger' : 'action-primary'}><Power size={18} weight="bold" />{code.isLive ? 'Take offline' : 'Go live'}</button></form></div></div></article></section></div>
}
