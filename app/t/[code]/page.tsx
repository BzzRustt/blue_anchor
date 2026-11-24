import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { VisitorPage } from '@/components/VisitorPage'
import { auth } from '@/lib/auth-server'
import { getVisitorExperience, modeKey } from '@/lib/product'

// Personal pages are reached by scanning, not searching: keep them out of search engines.
// The title is deliberately generic so an Incognito page never names its owner in a tab or share.
export const metadata: Metadata = { title: { absolute: 'ScanMe' }, robots: { index: false, follow: false } }

export default async function VisitorRoute({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [experience, viewer] = await Promise.all([getVisitorExperience(code), auth.api.getSession({ headers: await headers() }).catch(() => null)])
  if (!experience) notFound()
  const { owner, campaign, blocks, config } = experience
  // The owner opening their own page sees it as a preview: nothing they send is delivered or counted.
  const own = viewer?.user.id === experience.code.userId

  return (
    <main className="min-h-dvh bg-[var(--surface-muted)] px-4 py-6 sm:grid sm:place-items-center sm:py-10">
      <div className="mx-auto grid w-full max-w-md gap-3">
        {own && <p role="note" className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm">This is your own page, shown as visitors see it. Anything you send here is not delivered. <Link href="/app" className="font-bold underline">Back to ScanMe</Link></p>}
        <VisitorPage mode={modeKey(campaign.mode)} config={config} owner={owner} blocks={blocks} slug={code} preview={own} />
      </div>
    </main>
  )
}
