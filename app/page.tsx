import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile, Scan } from '@/types/database'
import ScannerPage from '@/components/ScannerPage'

export const dynamic = 'force-dynamic'

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

// UUIDv4 pattern — reject anything that doesn't look right before hitting the DB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

  const { data, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .single()

  const profile = data as Profile | null

  // PGRST116 = "no rows" from Supabase — profile hasn't been seeded yet, not a real error
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

  // Normalise searchParams — Next.js may give string | string[] for repeated params
  const rawToken = searchParams.token
  const token = typeof rawToken === 'string' ? rawToken : undefined

  if (!token) {
    // No token — generate a fresh one, log the scan, and redirect.
    // Await the insert so the token exists in the DB before the redirect lands.
    const sessionToken = uuidv4()

    const headersList = headers()
    const rawIP =
      headersList.get('x-forwarded-for')?.split(',')[0].trim() ??
      headersList.get('x-real-ip') ??
      '127.0.0.1'
    const ipHash = crypto.createHash('sha256').update(rawIP).digest('hex')

    await supabase.from('scans').insert({ session_token: sessionToken, ip_hash: ipHash })

    redirect(`/?token=${sessionToken}`)
  }

  // Fast path: reject malformed tokens without a DB round-trip
  if (!UUID_RE.test(token)) {
    return <ExpiredScreen />
  }

  // Validate: token must exist in scans and be within the 15-minute window
  const cutoff = new Date(Date.now() - FIFTEEN_MINUTES_MS).toISOString()
  const { data: scanData } = await supabase
    .from('scans')
    .select('id')
    .eq('session_token', token)
    .gte('scanned_at', cutoff)
    .maybeSingle()

  const scan = scanData as Pick<Scan, 'id'> | null

  if (!scan) {
    return <ExpiredScreen />
  }

  return <ScannerPage profile={profile} sessionToken={token} />
}
