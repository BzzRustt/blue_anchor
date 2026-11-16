'use client'

import { useActionState } from 'react'
import { requestAccess, type RecoveryState } from '@/app/e/[slug]/actions'

/** "Already registered?": email + access code; the answer never reveals whether the email is known. */
export function AttendeeRecoveryForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<RecoveryState, FormData>(requestAccess, { status: 'idle' })
  if (state.status === 'done') return <p role="status" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm leading-6">{state.message}</p>
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="slug" value={slug} />
      <label className="field-label">Email you registered with<input className="field-input" type="email" name="email" required autoComplete="email" /></label>
      <label className="field-label">Event access code<input className="field-input font-mono uppercase tracking-[.2em]" name="accessCode" required maxLength={20} autoComplete="off" autoCapitalize="characters" /></label>
      <button disabled={pending} className="action-secondary w-full justify-center">{pending ? 'Sending' : 'Email me my link'}</button>
    </form>
  )
}
