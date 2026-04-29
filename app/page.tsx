import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSessionToken, verifySessionToken } from '@/lib/session-token'
import type { Profile } from '@/types/database'
import ScannerPage from '@/components/ScannerPage'

export const dynamic = 'force-dynamic'

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

// Basic shape check — rejects obviously malformed tokens before crypto work
const TOKEN_RE = /^1\.[0-9a-z]+\.[0-9a-f]{64}$/

interface Props {
  searchParams: { token?: string | string[] }
}

function ExpiredScreen() {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-6 py-16"
      style={{ backgroundColor: '#f9f6f1' }}
    >
      <div className="max-w-sm w-full text-center space-y-4">
        <p className="text-4xl">⌛</p>
        <p className="text-stone-500 leading-relaxed text-[15px]">
          Looks like this link has done its thing. These are made fresh each time someone
          scans — so if you want to leave a note, come find me in person. Would love to
          hear from you!
        </p>
      </div>
    </main>
  )
}

export default async function Home({ searchParams }: Props) {
  const supabase = createAdminClient()
  const adminPass = process.env.ADMIN_PASSWORD ?? ''

  const { data, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .single()

  const profile = data as Profile | null

  // PGRST116 = "no rows" — profile not seeded yet, not a real error
  if (profileError && profileError.code !== 'PGRST116') {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-6"
        style={{ backgroundColor: '#f9f6f1' }}
      >
        <p className="text-stone-500 text-[15px] text-center leading-relaxed max-w-xs">
          Something went wrong loading this page. Please try scanning the QR code again.
        </p>
      </main>
    )
  }

  if (!profile) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#f9f6f1' }}
      >
        <p className="text-stone-400 text-sm">Coming soon.</p>
      </main>
    )
  }

  // Test mode: bypass all token logic so development flows without friction
  if (profile.test_mode) {
    const testToken = generateSessionToken(adminPass)
    return <ScannerPage profile={profile} sessionToken={testToken} testMode />
  }

  // Normalise searchParams
  const rawToken = searchParams.token
  const token = typeof rawToken === 'string' ? rawToken : undefined

  if (!token) {
    // No token — generate one, log the scan (fire-and-forget, no await),
    // and redirect. The token is self-validating via HMAC so the redirect
    // page doesn't need a DB round-trip to confirm freshness.
    const sessionToken = generateSessionToken(adminPass)

    const headersList = headers()
    const rawIP =
      headersList.get('x-forwarded-for')?.split(',')[0].trim() ??
      headersList.get('x-real-ip') ??
      '127.0.0.1'
    const ipHash = crypto.createHash('sha256').update(rawIP).digest('hex')

    // Not awaited — analytics write, doesn't block the redirect
    void supabase.from('scans').insert({ session_token: sessionToken, ip_hash: ipHash })

    redirect(`/?token=${sessionToken}`)
  }

  // Fast reject: malformed tokens skip crypto entirely
  if (!TOKEN_RE.test(token)) {
    return <ExpiredScreen />
  }

  // Validate HMAC + expiry — pure crypto, no DB call
  const issuedAt = verifySessionToken(token, adminPass)
  if (!issuedAt || Date.now() - issuedAt > FIFTEEN_MINUTES_MS) {
    return <ExpiredScreen />
  }

  return <ScannerPage profile={profile} sessionToken={token} />
}
