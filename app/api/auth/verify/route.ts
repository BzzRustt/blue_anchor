import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { authLimiter } from '@/lib/rate-limiter'

const bodySchema = z.object({
  password: z.string().min(1).max(200),
})

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    '0.0.0.0'
  )
}

// Hash both strings to the same fixed length before comparing,
// eliminating timing leaks from both character comparison and length mismatch.
function timingSafeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest()
  const hashB = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(hashA, hashB)
}

const FAIL_RESPONSE = NextResponse.json({ success: false }, { status: 200 })

export async function POST(request: NextRequest) {
  const ip = getClientIP(request)

  // Rate-limited IPs receive the same generic failure as a wrong password —
  // callers cannot distinguish rate limiting from bad credentials.
  if (authLimiter.isLimited(ip)) {
    return FAIL_RESPONSE
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return FAIL_RESPONSE
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return FAIL_RESPONSE
  }

  const adminPassword = process.env.ADMIN_PASSWORD ?? ''
  const valid = timingSafeEqual(parsed.data.password, adminPassword)

  if (!valid) {
    authLimiter.increment(ip)
    return FAIL_RESPONSE
  }

  authLimiter.clear(ip)

  const token = uuidv4()
  const response = NextResponse.json({ success: true }, { status: 200 })
  response.cookies.set('admin_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 86_400,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })

  return response
}
