'use client'

import { ArrowRight, GoogleLogo, SpinnerGap } from '@phosphor-icons/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { authClient } from '@/lib/auth-client'

export interface SignInMethods { emailCode: boolean; google: boolean }

/** Password always; an emailed six-digit code and Google once they are configured (M3, decision D1). */
export function AuthForm({ mode, methods = { emailCode: false, google: false } }: { mode: 'login' | 'signup'; methods?: SignInMethods }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<'password' | 'code' | 'enter-code'>('password')
  const [email, setEmail] = useState('')

  async function run(work: () => Promise<{ error?: { message?: string } | null } | undefined>, onOk: () => void) {
    setPending(true)
    setError('')
    const result = await work()
    if (result?.error) {
      setError(result.error.message ?? 'We could not complete that request.')
      setPending(false)
      return
    }
    onOk()
  }
  const done = () => { router.push('/app'); router.refresh() }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const address = String(data.get('email') ?? '').trim()
    const password = String(data.get('password') ?? '')
    void run(() => mode === 'signup'
      ? authClient.signUp.email({ name: String(data.get('name') ?? '').trim(), email: address, password })
      : authClient.signIn.email({ email: address, password }), done)
  }

  function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const address = String(new FormData(event.currentTarget).get('email') ?? '').trim()
    setEmail(address)
    void run(() => authClient.emailOtp.sendVerificationOtp({ email: address, type: 'sign-in' }), () => { setPending(false); setView('enter-code') })
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const otp = String(new FormData(event.currentTarget).get('otp') ?? '').trim()
    void run(() => authClient.signIn.emailOtp({ email, otp }), done)
  }

  const errorBox = error && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-3 text-sm text-[var(--danger)]">{error}</p>
  const icon = pending ? <SpinnerGap className="animate-spin" size={18} weight="bold" /> : <ArrowRight size={18} weight="bold" />
  const others = (methods.google || methods.emailCode) && (
    <div className="grid gap-3">
      <p className="text-center text-xs font-bold uppercase tracking-[.14em] text-[var(--faint)]">or</p>
      {methods.google && (
        <button type="button" className="action-secondary justify-center" disabled={pending} onClick={() => void run(() => authClient.signIn.social({ provider: 'google', callbackURL: '/app' }), () => {})}>
          <GoogleLogo size={18} weight="bold" />Continue with Google
        </button>
      )}
      {methods.emailCode && view === 'password' && <button type="button" className="action-secondary justify-center" onClick={() => { setError(''); setView('code') }}>Email me a sign-in code</button>}
      {view !== 'password' && <button type="button" className="text-sm font-bold text-[var(--accent-strong)]" onClick={() => { setError(''); setView('password') }}>Use a password instead</button>}
    </div>
  )

  if (view === 'code') return (
    <div className="grid gap-5">
      <form onSubmit={requestCode} className="grid gap-5">
        <label className="field-label">Email<input className="field-input" type="email" name="email" autoComplete="email" required defaultValue={email} placeholder="you@example.com" /></label>
        <p className="-mt-2 text-sm text-[var(--muted)]">We will email you a six-digit code. {mode === 'signup' ? 'Your account is created when you enter it.' : 'No password needed.'}</p>
        {errorBox}
        <button className="action-primary mt-1" disabled={pending}>{icon}{pending ? 'Please wait' : 'Send code'}</button>
      </form>
      {others}
    </div>
  )

  if (view === 'enter-code') return (
    <div className="grid gap-5">
      <form onSubmit={submitCode} className="grid gap-5">
        <p className="text-sm text-[var(--muted)]">If <strong>{email}</strong> can receive email, a code is on its way. It works for 10 minutes.</p>
        <label className="field-label">Six-digit code<input className="field-input font-mono text-lg tracking-[.3em]" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
        {errorBox}
        <button className="action-primary mt-1" disabled={pending}>{icon}{pending ? 'Please wait' : 'Sign in'}</button>
        <button type="button" className="text-sm font-bold text-[var(--accent-strong)]" onClick={() => setView('code')}>Send a new code</button>
      </form>
      {others}
    </div>
  )

  return (
    <div className="grid gap-5">
      <form onSubmit={submitPassword} className="grid gap-5">
        {mode === 'signup' && <label className="field-label">Name<input className="field-input" name="name" autoComplete="name" required maxLength={80} placeholder="Allen K." /></label>}
        <label className="field-label">Email<input className="field-input" type="email" name="email" autoComplete="email" required placeholder="you@example.com" /></label>
        <label className="field-label">Password<input className="field-input" type="password" name="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} placeholder="At least 8 characters" /></label>
        {mode === 'login' && <Link className="-mt-2 w-fit text-sm font-bold text-[var(--accent-strong)]" href="/forgot-password">Forgot your password?</Link>}
        {errorBox}
        <button className="action-primary mt-1" disabled={pending}>{icon}{pending ? 'Please wait' : mode === 'signup' ? 'Create account' : 'Log in'}</button>
      </form>
      {others}
    </div>
  )
}
