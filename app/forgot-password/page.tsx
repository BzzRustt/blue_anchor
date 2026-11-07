import type { Metadata } from 'next'
import { PasswordResetPage } from '@/components/PasswordResetPage'
export const metadata: Metadata = { title: 'Forgot password' }
export default function ForgotPasswordPage() { return <PasswordResetPage mode="request" /> }
