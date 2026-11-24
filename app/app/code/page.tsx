import Link from 'next/link'
import { ArrowLeft, Lock, Warning } from '@phosphor-icons/react/dist/ssr'
import { QrStudio } from '@/components/qr-studio/QrStudio'
import { appBaseUrl } from '@/lib/event-queries'
import { requireOwner } from '@/lib/owner'
import { ownerSummary } from '@/lib/product'

export const metadata = { title: 'Personalise your QR' }

export default async function CodePage() {
  const session = await requireOwner()
  const { code, active } = await ownerSummary(session.user.id)
  if (!code) throw new Error('Personal code missing after setup')
  // Same URL the plain /app/qr.png is made from. The browser is only ever handed this string; it cannot pick another.
  const url = `${appBaseUrl()}/t/${code.slug}`

  return (
    <div className="grid gap-5">
      <header>
        <Link href="/app" className="action-quiet -ml-3 !min-h-9"><ArrowLeft size={16} />Home</Link>
        <p className="overline mt-2">Personalise QR</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">Turn a picture into your code</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Your code still opens exactly the same page. Only how it looks changes. The standard code stays available from Show QR on Home.</p>
        <p className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]"><Lock size={16} className="shrink-0" />Your photo stays on this device. It is not uploaded.</p>
      </header>
      {active?.mode === 'incognito' && (
        <div role="note" className="soft-card flex gap-3 p-4 text-sm leading-6">
          <Warning size={20} className="mt-0.5 shrink-0 text-[var(--warning)]" />
          <p><strong>Your Mode is Incognito.</strong> Incognito hides your name and photo on your page, but a face in the code artwork will still show who you are to anyone who sees the code. Use a logo or an object instead if you want to stay anonymous.</p>
        </div>
      )}
      <QrStudio url={url} />
    </div>
  )
}
