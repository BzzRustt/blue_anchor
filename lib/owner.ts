import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth-server'
import { ensureOwnerSetup } from '@/lib/product'

export async function requireOwner() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')
  await ensureOwnerSetup(session.user.id, session.user.name)
  return session
}
