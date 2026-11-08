'use client'

import { ArrowRight, CheckCircle, SpinnerGap } from '@phosphor-icons/react'
import { useActionState } from 'react'
import { submitProfile, withdrawCard, type JoinState } from '@/app/e/[slug]/actions'
import type { Role } from '@/lib/events'

interface Props {
  slug: string
  eventName: string
  roles: Role[]
  questions: Array<{ id: string; prompt: string; placeholder: string; required: boolean }>
  /** Preformatted on the server so server and browser render identical text. */
  expiresLabel: string
  existing: { tag: string; name: string; answers: Record<string, string>; hidden: boolean } | null
}

export function AttendeeProfileForm({ slug, eventName, roles, questions, expiresLabel, existing }: Props) {
  const [state, action, pending] = useActionState<JoinState, FormData>(submitProfile, { status: 'idle' })

  if (state.status === 'saved') {
    return (
      <div className="grid gap-5">
        <div className="rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-6 text-center">
          <CheckCircle size={40} weight="fill" className="mx-auto text-[var(--accent)]" />
          <p className="mt-3 text-sm font-bold text-[var(--muted)]">{state.created ? 'You’re in. Your tag is' : 'Card updated. Your tag is'}</p>
          <p className="mt-1 font-mono text-5xl font-extrabold tracking-tight">{state.tag}</p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Write it on your badge or tell people. They can find you with it until {expiresLabel}.</p>
        </div>
        <ExpiryNotice expiresLabel={expiresLabel} />
        <a className="action-secondary w-full justify-center" href={`/e/${slug}/join`}>Edit my details</a>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      {existing?.hidden && <p role="status" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">Your card is currently hidden. Saving will put it back.</p>}
      <form action={action} className="grid gap-5 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
        <input type="hidden" name="slug" value={slug} />
        {existing && <p className="text-sm font-bold">Your tag: <span className="font-mono text-lg">{existing.tag}</span></p>}
        <label className="field-label">Your name<input className="field-input" name="name" required minLength={2} maxLength={80} autoComplete="name" defaultValue={existing?.name ?? ''} placeholder="As you’d like it on your card" /></label>
        {!existing && roles.length > 0 && (
          <fieldset>
            <legend className="text-sm font-extrabold">I’m here as</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {roles.map((role, index) => (
                <label key={role.letter} className="cursor-pointer">
                  <input type="radio" className="peer sr-only" name="role" value={role.letter} required defaultChecked={index === 0 && roles.length === 1} />
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 text-sm font-bold peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent-soft)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)]"><span className="font-mono">{role.letter}</span>{role.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {questions.map((question) => (
          <label key={question.id} className="field-label">{question.prompt}{!question.required && <span className="font-normal text-[var(--faint)]"> · optional</span>}
            <textarea className="field-textarea min-h-[84px]" name={`q_${question.id}`} required={question.required} maxLength={500} defaultValue={existing?.answers[question.id] ?? ''} placeholder={question.placeholder} />
          </label>
        ))}
        {state.status === 'error' && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_32%,var(--line))] p-3 text-sm text-[var(--danger)]">{state.message}</p>}
        <button disabled={pending} className="action-primary w-full">{pending ? <SpinnerGap className="animate-spin" size={19} /> : <ArrowRight size={19} weight="bold" />}{pending ? 'Saving' : existing ? 'Save my card' : 'Join the directory'}</button>
        <Visibility eventName={eventName} expiresLabel={expiresLabel} />
      </form>
      {existing && !existing.hidden && (
        <form action={withdrawCard} className="text-center">
          <input type="hidden" name="slug" value={slug} />
          <button className="text-sm font-bold text-[var(--muted)] underline underline-offset-4">Remove my card from the directory</button>
        </form>
      )}
    </div>
  )
}

/** Said before submitting, in plain words: who sees what, and until when. */
function Visibility({ eventName, expiresLabel }: { eventName: string; expiresLabel: string }) {
  return <p className="text-[12px] leading-5 text-[var(--faint)]">People at {eventName} who have the event code can see your name, role and answers until {expiresLabel}. Your email is never shown.</p>
}

function ExpiryNotice({ expiresLabel }: { expiresLabel: string }) {
  return (
    <div className="rounded-[22px] border border-[var(--accent)] bg-[var(--accent-soft)] p-5">
      <p className="font-extrabold">Keep what you collect</p>
      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Everything here disappears after {expiresLabel}. Create a free ScanMe account before then to keep your connections, and to get your own permanent code.</p>
      <a href="/signup" className="action-primary mt-4 w-full justify-center">Create a ScanMe account</a>
    </div>
  )
}
