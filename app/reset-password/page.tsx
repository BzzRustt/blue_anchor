import type { Metadata } from 'next'
import { PasswordResetPage } from '@/components/PasswordResetPage'
export const metadata: Metadata = { title: 'Reset password', robots: { index: false, follow: false } }
export default function ResetPasswordPage() { return <PasswordResetPage mode="reset" /> }
