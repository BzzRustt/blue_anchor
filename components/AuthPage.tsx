import Link from 'next/link'
import { AuthFrame } from '@/components/AuthFrame'
import { AuthForm } from '@/components/AuthForm'
import { signInMethods } from '@/lib/auth-server'

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup'
  return (
    <AuthFrame
      title={signup ? 'Create your account' : 'Welcome back'}
      subtitle={signup ? 'Run an event, or start with one permanent code and your first campaign.' : 'Open your inbox, run your events, or check what converted.'}
      footer={<>{signup ? 'Already have an account?' : 'New to ScanMe?'} <Link className="font-bold text-[var(--accent-strong)]" href={signup ? '/login' : '/signup'}>{signup ? 'Log in' : 'Sign up'}</Link></>}
    >
      <AuthForm mode={mode} methods={signInMethods()} />
    </AuthFrame>
  )
}
