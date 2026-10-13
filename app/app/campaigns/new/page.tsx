import Link from 'next/link'
import { ArrowLeft, Briefcase, LockKey, Palette, UsersThree } from '@phosphor-icons/react/dist/ssr'
import { createCampaign } from '@/app/app/actions'
import { PageIntro } from '@/components/workspace/PageIntro'

const modes = [
  { value: 'networking', name: 'Networking', body: 'Share your role, goals and a useful reason to connect.', icon: UsersThree },
  { value: 'private', name: 'Private notes', body: 'Collect honest feedback that only you can read.', icon: LockKey },
  { value: 'creator', name: 'Creator', body: 'Ask your audience what to make next and gather enquiries.', icon: Palette },
  { value: 'portfolio', name: 'Portfolio', body: 'Guide interest toward your work, services and contact links.', icon: Briefcase },
] as const

export default function NewCampaignPage() {
  return (
    <div className="grid gap-7">
      <Link href="/app/campaigns" className="action-quiet w-fit px-0"><ArrowLeft size={18} />Back to campaigns</Link>
      <PageIntro eyebrow="New version" title="Create a campaign" body="Choose the reason people should scan, then write the two questions they will see." />
      <form action={createCampaign} className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <section className="soft-card p-5 sm:p-7"><h2 className="text-lg font-extrabold">1. Choose an intent</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{modes.map((mode, index) => <label key={mode.value} className="relative cursor-pointer"><input className="peer sr-only" type="radio" name="mode" value={mode.value} defaultChecked={index === 0} /><span className="flex min-h-36 flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 transition peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent-soft)]"><mode.icon size={24} className="text-[var(--accent-strong)]" /><strong className="mt-4">{mode.name}</strong><span className="mt-1 text-xs leading-5 text-[var(--muted)]">{mode.body}</span></span></label>)}</div></section>
        <section className="soft-card p-5 sm:p-7"><h2 className="text-lg font-extrabold">2. Shape the experience</h2><div className="mt-5 grid gap-5"><label className="field-label">Campaign name<input className="field-input" name="name" required maxLength={80} placeholder="Design conference" /></label><label className="field-label">Rating question<input className="field-input" name="question" required maxLength={180} placeholder="How useful was our conversation?" /></label><label className="field-label">Message prompt<input className="field-input" name="messagePrompt" maxLength={180} placeholder="What should we talk about next?" /></label><button className="action-primary mt-2">Save draft</button></div></section>
      </form>
    </div>
  )
}
