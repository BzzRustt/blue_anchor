import Link from 'next/link'
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr'
import { CampaignForm } from '@/components/workspace/CampaignForm'
import { PageIntro } from '@/components/workspace/PageIntro'

export default function NewCampaignPage() {
  return (
    <div className="grid gap-7">
      <Link href="/app/campaigns" className="action-quiet w-fit px-0"><ArrowLeft size={18} />Back to campaigns</Link>
      <PageIntro eyebrow="New version" title="Create a campaign" body="Choose the reason people should scan, then write the two questions they will see." />
      <CampaignForm />
    </div>
  )
}
