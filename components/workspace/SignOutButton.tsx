'use client'

import { SignOut } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

/** `onDark` is for deep-green surfaces, where the default muted text would be unreadable. */
export function SignOutButton({ onDark = false }: { onDark?: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    await authClient.signOut()
    router.push('/')
    router.refresh()
  }

  const tone = onDark ? ' !text-[var(--side-ink)] hover:!bg-[var(--side-hover)] hover:!text-white focus-visible:[outline-color:var(--lime)]' : ''
  return <button type="button" onClick={signOut} disabled={pending} className={`action-quiet w-full justify-start px-3${tone}`}><SignOut size={19} />{pending ? 'Signing out' : 'Log out'}</button>
}
