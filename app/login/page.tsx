import type { Metadata } from 'next'
import { AuthPage } from '@/components/AuthPage'
export const metadata: Metadata = { title: 'Log in' }
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) { return <AuthPage mode="login" next={(await searchParams).next} /> }
