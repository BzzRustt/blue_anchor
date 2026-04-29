import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { submissionLimiter } from '@/lib/rate-limiter'
import { verifySessionToken } from '@/lib/session-token'
import type { Response as ScanResponse } from '@/types/database'

const bodySchema = z.object({
  // HMAC tokens have the form "1.<base36>.<64 hex chars>"
  session_token: z.string().min(10).max(200),
  // min(1) is enforced client-side; API accepts empty for profiles without a poll
  poll_answer: z.string().max(500),
  comment: z.string().max(2000).optional(),
  commenter_name: z.string().max(100).optional(),
})

function getIPHash(request: NextRequest): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    '0.0.0.0'
  return crypto.createHash('sha256').update(ip).digest('hex')
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  // Fetch profile to check test_mode — skips security gates during development
  const { data: profileData } = await supabase
    .from('profiles')
    .select('test_mode')
    .maybeSingle()
  const testMode = (profileData as { test_mode?: boolean } | null)?.test_mode === true

  const ipHash = getIPHash(request)

  if (!testMode && submissionLimiter.isLimited(ipHash)) {
    return NextResponse.json(
      { success: false, message: 'Something went wrong. Please try again.' },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: 'Invalid input.' }, { status: 400 })
  }

  const { session_token, poll_answer, comment, commenter_name } = parsed.data
  const adminPass = process.env.ADMIN_PASS ?? ''

  if (!testMode) {
    // Validate HMAC token + expiry — no DB round-trip needed
    const issuedAt = verifySessionToken(session_token, adminPass)
    if (!issuedAt || Date.now() - issuedAt > FIFTEEN_MINUTES_MS) {
      return NextResponse.json(
        { success: false, message: 'This link has expired.' },
        { status: 400 }
      )
    }

    // One response per session token
    const { data: existingData } = await supabase
      .from('responses')
      .select('id')
      .eq('session_token', session_token)
      .maybeSingle()

    const existing = existingData as Pick<ScanResponse, 'id'> | null

    if (existing) {
      return NextResponse.json(
        { success: false, message: 'Already submitted.' },
        { status: 400 }
      )
    }
  }

  const { error: insertError } = await supabase.from('responses').insert({
    session_token,
    poll_answer: poll_answer || null,
    comment: comment ?? null,
    commenter_name: commenter_name ?? null,
    device_hash: ipHash,
  })

  if (insertError) {
    console.error('[api/responses] insert error:', insertError.message)
    return NextResponse.json(
      { success: false, message: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }

  if (!testMode) {
    submissionLimiter.increment(ipHash)
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
