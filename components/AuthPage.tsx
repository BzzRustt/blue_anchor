import Link from 'next/link'
import { AuthFrame } from '@/components/AuthFrame'
import { AuthForm } from '@/components/AuthForm'
import { signInMethods } from '@/lib/auth-server'

/** `next` is only honoured for in-app paths, never another site. */
export function AuthPage({ mode, next }: { mode: 'login' | 'signup'; next?: string }) {
  const safeNext = next && /^\/(app|e\/[a-z0-9-]{1,80})(\/|$)/.test(next) ? next : '/app'
  const signup = mode === 'signup'
  return (
    <AuthFrame
      title={signup ? 'Create your account' : 'Welcome back'}
      subtitle={signup ? 'Run an event, or start with one permanent code and your first campaign.' : 'Open your inbox, run your events, or check what converted.'}
      footer={<>{signup ? 'Already have an account?' : 'New to ScanMe?'} <Link className="font-bold text-[var(--accent-strong)]" href={`${signup ? '/login' : '/signup'}${safeNext !== '/app' ? `?next=${encodeURIComponent(safeNext)}` : ''}`}>{signup ? 'Log in' : 'Sign up'}</Link></>}
    >
      <AuthForm mode={mode} methods={signInMethods()} next={safeNext} />
      {signup && <p className="mt-4 text-center text-xs leading-5 text-[var(--muted)]">By creating an account you agree to our <Link href="/terms" className="font-bold underline">Terms</Link> and confirm you have read our <Link href="/privacy" className="font-bold underline">Privacy notice</Link>. You must be 16 or over.</p>}
    </AuthFrame>
  )
}
