import Link from 'next/link'
import { Suspense } from 'react'
import { Brand } from '@/components/Brand'
import { PasswordResetForm } from '@/components/PasswordResetForm'

/** Mirrors components/AuthPage.tsx so the reset flow does not look like a different product. */
export function PasswordResetPage({ mode }: { mode: 'request' | 'reset' }) {
  const request = mode === 'request'
  return <main className="site-shell grid min-h-[100dvh] place-items-center py-8"><div className="w-full max-w-md"><Link className="mb-8 block w-fit" href="/"><Brand /></Link><section className="soft-card p-7 md:p-9"><h1 className="text-4xl font-extrabold tracking-[-.06em]">{request ? 'Forgot your password?' : 'Choose a new password'}</h1><p className="mb-7 mt-3 text-sm leading-6 text-[var(--muted)]">{request ? 'Enter the email on your account and we will send you a link to set a new password.' : 'Pick something at least 8 characters long. This link works once.'}</p><Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading…</p>}><PasswordResetForm mode={mode} /></Suspense></section>{request && <p className="mt-5 text-center text-sm text-[var(--muted)]">Remembered it? <Link className="font-bold text-[var(--accent-strong)]" href="/login">Log in</Link></p>}</div></main>
}
