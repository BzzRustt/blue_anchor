import Link from 'next/link'
import { Suspense } from 'react'
import { AuthFrame } from '@/components/AuthFrame'
import { PasswordResetForm } from '@/components/PasswordResetForm'

/** Uses the same frame as log in and sign up so the reset flow does not look like a different product. */
export function PasswordResetPage({ mode }: { mode: 'request' | 'reset' }) {
  const request = mode === 'request'
  return (
    <AuthFrame
      title={request ? 'Forgot your password?' : 'Choose a new password'}
      subtitle={request ? 'Enter the email on your account and we will send you a link to set a new password.' : 'Pick something at least 8 characters long. This link works once.'}
      footer={request ? <>Remembered it? <Link className="font-bold text-[var(--accent-strong)]" href="/login">Log in</Link></> : undefined}
    >
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading…</p>}><PasswordResetForm mode={mode} /></Suspense>
    </AuthFrame>
  )
}
