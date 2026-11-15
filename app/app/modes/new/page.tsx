import Link from 'next/link'
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr'
import { CampaignForm } from '@/components/workspace/CampaignForm'
import { PageIntro } from '@/components/workspace/PageIntro'

export default function NewModePage() {
  return (
    <div className="grid gap-7">
      <Link href="/app/modes" className="action-quiet w-fit px-0"><ArrowLeft size={18} />Back to Modes</Link>
      <PageIntro eyebrow="New Mode" title="Create a Mode" body="Choose the reason people should scan, then write the two questions they will see." />
      <CampaignForm />
    </div>
  )
}
