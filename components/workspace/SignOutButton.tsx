'use client'

import { SignOut } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    await authClient.signOut()
    router.push('/')
    router.refresh()
  }

  return <button type="button" onClick={signOut} disabled={pending} className="action-quiet w-full justify-start px-3"><SignOut size={19} />{pending ? 'Signing out' : 'Log out'}</button>
}
