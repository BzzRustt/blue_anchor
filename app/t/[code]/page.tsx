import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { VisitorPage } from '@/components/VisitorPage'
import { getVisitorExperience, modeKey } from '@/lib/product'

// Personal pages are reached by scanning, not searching: keep them out of search engines.
// The title is deliberately generic so an Incognito page never names its owner in a tab or share.
export const metadata: Metadata = { title: { absolute: 'ScanMe' }, robots: { index: false, follow: false } }

export default async function VisitorRoute({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const experience = await getVisitorExperience(code)
  if (!experience) notFound()
  const { owner, campaign, blocks, config } = experience

  return (
    <main className="min-h-dvh bg-[var(--surface-muted)] px-4 py-6 sm:grid sm:place-items-center sm:py-10">
      <VisitorPage mode={modeKey(campaign.mode)} config={config} owner={owner} blocks={blocks} slug={code} />
    </main>
  )
}
