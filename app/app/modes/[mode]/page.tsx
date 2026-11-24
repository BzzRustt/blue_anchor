import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Check, Eye, LockSimple } from '@phosphor-icons/react/dist/ssr'
import { ConfirmForm } from '@/components/ConfirmForm'
import { DirtyForm, SaveButton } from '@/components/DirtyForm'
import { activateMode, saveMode } from '@/app/app/modes/actions'
import { getModeState } from '@/lib/mode-queries'
import { QuestionFields } from '@/components/workspace/QuestionFields'
import { isModeKey, MODE_INFO, SHOW_LABELS, ALLOWED_SHOW, type ModeConfig } from '@/lib/modes'
import { canActivateMode } from '@/lib/plans'
import { requireOwner } from '@/lib/owner'

type Search = { saved?: string; activated?: string; locked?: string }

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <section className="soft-card grid gap-4 p-5 sm:p-6"><div><h2 className="text-lg font-extrabold tracking-[-.03em]">{title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{hint}</p></div>{children}</section>
}

function Toggle({ name, label, hint, checked }: { name: string; label: string; hint?: string; checked: boolean }) {
  return <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] p-3"><input type="checkbox" name={name} defaultChecked={checked} className="mt-1 h-4 w-4 accent-[var(--accent)]" /><span><span className="block text-sm font-bold">{label}</span>{hint && <span className="mt-0.5 block text-xs text-[var(--muted)]">{hint}</span>}</span></label>
}

function Text({ name, label, value, placeholder, max = 120, area = false }: { name: string; label: string; value: string; placeholder?: string; max?: number; area?: boolean }) {
  return <label className="field-label">{label}{area ? <textarea className="field-textarea" name={name} defaultValue={value} placeholder={placeholder} maxLength={max} /> : <input className="field-input" name={name} defaultValue={value} placeholder={placeholder} maxLength={max} />}</label>
}

export default async function ModeEditor({ params, searchParams }: { params: Promise<{ mode: string }>; searchParams: Promise<Search> }) {
  const { mode } = await params
  if (!isModeKey(mode)) notFound()
  const query = await searchParams
  const session = await requireOwner()
  const { plan, config, active, campaign, code } = await getModeState(session.user.id, mode)
  const info = MODE_INFO[mode]
  const locked = !canActivateMode(plan, mode).ok
  const c: ModeConfig = config

  return (
    <div className="grid gap-6">
      <Link href="/app/modes" className="action-quiet w-fit !px-0"><ArrowLeft size={18} />All Modes</Link>
      <header>
        <p className="overline">{info.pro ? 'Pro Mode' : 'Free Mode'}{active && ' · Currently active'}</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">{info.name} <span className="serif-accent">Mode</span></h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{info.blurb} <strong className="text-[var(--ink)]">Visitors see:</strong> {info.sees} <strong className="text-[var(--ink)]">They can:</strong> {info.does}</p>
      </header>

      {query.saved && <p role="status" className="flex items-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-bold"><Check size={18} weight="bold" />Saved. {active ? 'Visitors see the update now.' : 'Preview it, then activate when you are ready.'}</p>}
      {query.activated && <p role="status" className="flex items-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-bold"><Check size={18} weight="bold" />{info.name} is now your active Mode.{code && !code.isLive ? ' Sharing is still paused, so visitors will not see it until you turn sharing on from Home.' : ''}</p>}
      {(locked || query.locked) && (
        <div role="note" className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-start gap-2 text-sm"><LockSimple size={18} weight="bold" className="mt-0.5 shrink-0" />{info.name} is a Pro Mode. You can look around and preview it. Saving changes and activating need Pro.</p><Link href="/plans" className="action-secondary shrink-0">Compare plans</Link></div>
      )}

      <DirtyForm action={saveMode} className="grid gap-5">
        <input type="hidden" name="mode" value={mode} />
        <fieldset disabled={locked} className="grid min-w-0 gap-5 border-0 p-0">
          <Section title="What to show" hint="Choose which details from your Profile visitors can see. Edit the details themselves in Profile.">
            {mode === 'incognito'
              ? <p className="rounded-xl bg-[var(--surface-muted)] p-3 text-sm">Your name, photo, bio and accounts always stay hidden in Incognito. Visitors only see the question.</p>
              : <div className="grid gap-2 sm:grid-cols-2">{ALLOWED_SHOW[mode].map((field) => <Toggle key={field} name={`show_${field}`} label={SHOW_LABELS[field]} checked={c.show[field] === true} />)}</div>}
            {mode !== 'incognito' && <p className="text-xs text-[var(--muted)]">Your name is always shown. <Link href="/app/profile" className="font-bold text-[var(--accent)] underline">Edit your Profile</Link></p>}
          </Section>

          <Section title="What visitors can do" hint={mode === 'networking' ? 'Visitors send a short introduction. It is not open chat.' : 'Choose what visitors can do on your page.'}>
            {(mode === 'basic' || mode === 'incognito') && (
              <>
                <Toggle name="message_on" label="Let visitors leave a message" hint="Optional by default." checked={c.message.on} />
                <Text name="message_prompt" label="Message prompt" value={c.message.prompt} />
                <Toggle name="message_required" label="Make the message required" checked={c.message.required} />
              </>
            )}
            {mode === 'networking' && <p className="rounded-xl bg-[var(--surface-muted)] p-3 text-sm">Visitors enter their name and a short introduction, and can add an email or LinkedIn if they want you to reply. Rate limits, reporting and blocking protect you from spam. Nothing else to set up.</p>}
            {mode === 'creator' && (
              <>
                <div className="grid gap-3 rounded-xl border border-[var(--line)] p-4"><p className="text-sm font-extrabold">Featured item (one at a time)</p>
                  <Text name="featured_title" label="Title" value={c.creator.featured.title} placeholder="Listen to my new single" max={80} />
                  <Text name="featured_description" label="Short description" value={c.creator.featured.description} max={160} />
                  <Text name="featured_url" label="Link (https://...)" value={c.creator.featured.url} max={300} placeholder="https://" />
                  <Text name="featured_image" label="Thumbnail image link (optional)" value={c.creator.featured.imageUrl} max={300} placeholder="https://" />
                  <Text name="featured_button" label="Button label" value={c.creator.featured.button} max={30} />
                </div>
                <div className="grid gap-3 rounded-xl border border-[var(--line)] p-4"><p className="text-sm font-extrabold">Up to three more links</p>
                  {[0, 1, 2].map((n) => <div key={n} className="grid gap-3 sm:grid-cols-2"><Text name={`link${n + 1}_label`} label={`Link ${n + 1} label`} value={c.creator.links[n]?.label ?? ''} max={40} /><Text name={`link${n + 1}_url`} label={`Link ${n + 1} address`} value={c.creator.links[n]?.url ?? ''} max={300} placeholder="https://" /></div>)}
                </div>
                <Toggle name="collab_on" label="Show a collaboration or enquiry box" checked={c.creator.collab} />
              </>
            )}
            {mode === 'portfolio' && (
              <>
                <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-2 text-sm font-extrabold">Style</legend>
                  {([['professional', 'Professional', 'Project cards with descriptions. For consultants, developers, architects.'], ['visual', 'Visual', 'Larger images. For photographers, artists, designers.']] as const).map(([value, label, hint]) => <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] p-3"><input type="radio" name="pf_style" value={value} defaultChecked={c.portfolio.style === value} className="mt-1 accent-[var(--accent)]" /><span><span className="block text-sm font-bold">{label}</span><span className="text-xs text-[var(--muted)]">{hint}</span></span></label>)}
                </fieldset>
                <Text name="pf_intro" label="Introduction" value={c.portfolio.intro} max={200} area />
                {[0, 1, 2].map((n) => <div key={n} className="grid gap-3 rounded-xl border border-[var(--line)] p-4"><p className="text-sm font-extrabold">Project {n + 1}</p>
                  <Text name={`project${n + 1}_title`} label="Title" value={c.portfolio.projects[n]?.title ?? ''} max={80} />
                  <Text name={`project${n + 1}_description`} label="Short description" value={c.portfolio.projects[n]?.description ?? ''} max={160} />
                  <Text name={`project${n + 1}_url`} label="Project link (optional)" value={c.portfolio.projects[n]?.url ?? ''} max={300} placeholder="https://" />
                  <Text name={`project${n + 1}_image`} label="Cover image link (optional)" value={c.portfolio.projects[n]?.imageUrl ?? ''} max={300} placeholder="https://" />
                </div>)}
                <Toggle name="pf_enquiry" label="Show a Contact me / enquiry form" checked={c.portfolio.enquiry} />
              </>
            )}
          </Section>

          <Section title="What to ask" hint={mode === 'creator' ? 'An optional poll for your audience.' : mode === 'basic' || mode === 'incognito' ? 'One optional question. Responses land in your personal inbox.' : 'This Mode asks for an introduction or enquiry, so there is no extra question to set up.'}>
            {(mode === 'basic' || mode === 'incognito') && (
              <>
                <QuestionFields on={c.question.on} type={c.question.type} prompt={c.question.prompt} max={c.question.max} options={c.question.options} />
              </>
            )}
            {mode === 'creator' && (
              <>
                <Toggle name="poll_on" label="Show a poll" checked={c.creator.poll.on} />
                <Text name="poll_prompt" label="Poll question" value={c.creator.poll.prompt} placeholder="Which city should I perform in next?" />
                <label className="field-label">Poll options (one per line, 2 to 4)<textarea className="field-textarea" name="poll_options" defaultValue={c.creator.poll.options.join('\n')} maxLength={200} /></label>
              </>
            )}
          </Section>
        </fieldset>
        {!locked && <SaveButton />}
      </DirtyForm>

      <section aria-label="Preview and activate" className="soft-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div><h2 className="text-lg font-extrabold tracking-[-.03em]">{active ? 'This Mode is active' : 'Ready to try it?'}</h2><p className="mt-1 text-sm text-[var(--muted)]">{campaign ? 'See exactly what a visitor sees. Nothing is sent or counted in the preview.' : 'Preview shows the default layout until you save your changes.'}</p></div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/modes/${mode}/preview`} className="action-secondary"><Eye size={18} />See what others see</Link>
          {!active && !locked && <ConfirmForm action={activateMode} title={`Make ${info.name} your active Mode?`} message="Your permanent QR will open this Mode. The QR itself does not change, and paused sharing stays paused." confirmLabel="Activate Mode" triggerLabel="Activate Mode" triggerClassName="action-primary"><input type="hidden" name="mode" value={mode} /></ConfirmForm>}
        </div>
      </section>
    </div>
  )
}
