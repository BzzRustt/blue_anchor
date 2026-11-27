'use client'

import Link from 'next/link'
import { ArrowLeft } from '@phosphor-icons/react'
import { authClient } from '@/lib/auth-client'

/**
 * Log in / Sign up for visitors; "Back to ScanMe" for someone already signed in (so Compare plans,
 * How it works and the landing page are never a dead end). Checked in the browser so these
 * marketing pages stay static.
 */
export function AccountLinks() {
  const { data, isPending } = authClient.useSession()
  if (!isPending && data) return <Link className="action-primary" href="/app"><ArrowLeft size={17} weight="bold" />Back to ScanMe</Link>
  return (
    <>
      <Link className="action-quiet max-[420px]:!hidden" href="/login">Log in</Link>
      <Link className="action-primary" href="/signup">Sign up</Link>
    </>
  )
}
