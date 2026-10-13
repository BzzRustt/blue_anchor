'use client'

import { ArrowRight, SpinnerGap } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { authClient } from '@/lib/auth-client'

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '').trim()
    const password = String(data.get('password') ?? '')

    const result = mode === 'signup'
      ? await authClient.signUp.email({ name: String(data.get('name') ?? '').trim(), email, password })
      : await authClient.signIn.email({ email, password })

    if (result.error) {
      setError(result.error.message ?? 'We could not complete that request.')
      setPending(false)
      return
    }

    router.push('/app/inbox')
    router.refresh()
  }

  return <form onSubmit={submit} className="grid gap-5">{mode === 'signup' && <label className="field-label">Name<input className="field-input" name="name" autoComplete="name" required maxLength={80} placeholder="Allen K." /></label>}<label className="field-label">Email<input className="field-input" type="email" name="email" autoComplete="email" required placeholder="you@example.com" /></label><label className="field-label">Password<input className="field-input" type="password" name="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} placeholder="At least 8 characters" /></label>{error && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-3 text-sm text-[var(--danger)]">{error}</p>}<button className="action-primary mt-1" disabled={pending}>{pending ? <SpinnerGap className="animate-spin" size={18} weight="bold" /> : <ArrowRight size={18} weight="bold" />}{pending ? 'Please wait' : mode === 'signup' ? 'Create account' : 'Log in'}</button></form>
}
