import Link from 'next/link'
import { Brand } from '@/components/Brand'
import { AuthForm } from '@/components/AuthForm'

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup'
  return <main className="site-shell grid min-h-[100dvh] place-items-center py-8"><div className="w-full max-w-md"><Link className="mb-8 block w-fit" href="/"><Brand /></Link><section className="soft-card p-7 md:p-9"><h1 className="text-4xl font-extrabold tracking-[-.06em]">{signup ? 'Create your ScanMe' : 'Welcome back'}</h1><p className="mb-7 mt-3 text-sm leading-6 text-[var(--muted)]">{signup ? 'Start with one permanent code and publish your first campaign.' : 'Open your inbox, update a campaign, or check what converted.'}</p><AuthForm mode={mode} /></section><p className="mt-5 text-center text-sm text-[var(--muted)]">{signup ? 'Already have an account?' : 'New to ScanMe?'} <Link className="font-bold text-[var(--accent-strong)]" href={signup ? '/login' : '/signup'}>{signup ? 'Log in' : 'Sign up'}</Link></p></div></main>
}
