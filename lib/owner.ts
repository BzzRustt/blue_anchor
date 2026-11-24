import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth-server'
import { ensureOwnerSetup } from '@/lib/product'

/** The signed-in owner's session, read once per request however many components ask. */
export const getOwnerSession = cache(async () => auth.api.getSession({ headers: await headers() }))

// ponytail: per-server-instance memo of owners whose code and first Mode exist. A cold instance
// re-checks once per owner; move to a column on users if setup ever needs re-running.
const setUp = new Set<string>()

/**
 * Every workspace page and its layout call this. It is cached per request, and the first-visit
 * setup (personal code + Basic Mode, under a lock) runs only until it has succeeded once.
 */
export const requireOwner = cache(async () => {
  const session = await getOwnerSession()
  if (!session) redirect('/login')
  if (!setUp.has(session.user.id)) {
    await ensureOwnerSetup(session.user.id, session.user.name)
    setUp.add(session.user.id)
  }
  return session
})
