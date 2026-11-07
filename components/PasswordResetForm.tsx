'use client'

import { ArrowRight, CheckCircle, SpinnerGap } from '@phosphor-icons/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { authClient } from '@/lib/auth-client'

/**
 * Both halves of the password reset flow.
 *
 * 'request' asks for an email and always reports the same thing back, because telling
 * someone whether an address is registered is an account-existence leak.
 * 'reset' consumes the ?token= that Better Auth appends when it redirects a valid link.
 */
export function PasswordResetForm({ mode }: { mode: 'request' | 'reset' }) {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const linkError = params.get('error')

  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const data = new FormData(event.currentTarget)

    if (mode === 'request') {
      await authClient.requestPasswordReset({
        email: String(data.get('email') ?? '').trim(),
        redirectTo: '/reset-password',
      })
      // Deliberately ignores the result: a failure here must not distinguish a
      // registered address from an unregistered one.
      setSent(true)
      setPending(false)
      return
    }

    const password = String(data.get('password') ?? '')
    if (password !== String(data.get('confirm') ?? '')) {
      setError('Those two passwords do not match.')
      setPending(false)
      return
    }

    const result = await authClient.resetPassword({ newPassword: password, token })
    if (result.error) {
      setError(result.error.message ?? 'That reset link is no longer valid. Request a new one.')
      setPending(false)
      return
    }

    router.push('/login')
    router.refresh()
  }

  if (sent) {
    return <div className="grid gap-5">
      <p className="flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--accent-strong)_30%,var(--line))] bg-[color-mix(in_srgb,var(--accent-strong)_7%,var(--surface))] p-4 text-sm leading-6" role="status"><CheckCircle className="mt-0.5 shrink-0 text-[var(--accent-strong)]" size={20} weight="fill" />If that email has a ScanMe account, a reset link is on its way. It expires in an hour.</p>
      <Link className="action-primary justify-center" href="/login">Back to log in</Link>
    </div>
  }

  if (mode === 'reset' && (!token || linkError)) {
    return <div className="grid gap-5">
      <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-4 text-sm leading-6 text-[var(--danger)]">This reset link has expired or has already been used. Request a new one and it will work.</p>
      <Link className="action-primary justify-center" href="/forgot-password">Request a new link</Link>
    </div>
  }

  return <form onSubmit={submit} className="grid gap-5">
    {mode === 'request'
      ? <label className="field-label">Email<input className="field-input" type="email" name="email" autoComplete="email" required placeholder="you@example.com" /></label>
      : <><label className="field-label">New password<input className="field-input" type="password" name="password" autoComplete="new-password" required minLength={8} placeholder="At least 8 characters" /></label>
        <label className="field-label">Confirm new password<input className="field-input" type="password" name="confirm" autoComplete="new-password" required minLength={8} placeholder="Type it again" /></label></>}
    {error && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-3 text-sm text-[var(--danger)]">{error}</p>}
    <button className="action-primary mt-1" disabled={pending}>{pending ? <SpinnerGap className="animate-spin" size={18} weight="bold" /> : <ArrowRight size={18} weight="bold" />}{pending ? 'Please wait' : mode === 'request' ? 'Send reset link' : 'Save new password'}</button>
  </form>
}
