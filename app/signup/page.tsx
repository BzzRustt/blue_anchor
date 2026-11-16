import type { Metadata } from 'next'
import { AuthPage } from '@/components/AuthPage'
export const metadata: Metadata = { title: 'Sign up' }
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) { return <AuthPage mode="signup" next={(await searchParams).next} /> }
