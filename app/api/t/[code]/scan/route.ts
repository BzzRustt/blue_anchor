import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { schema, visitorDb } from '@/lib/db'
import { getVisitorExperience } from '@/lib/product'
import { generateSessionToken } from '@/lib/session-token'

const COOKIE = 'scanme_guest'

function requestIp(request: NextRequest) { return request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? request.headers.get('x-real-ip') ?? '0.0.0.0' }
function hashIp(ip: string, secret: string) { return crypto.createHmac('sha256', secret).update(ip).digest('hex') }

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const experience = await getVisitorExperience(code)
  if (!experience) return NextResponse.json({ error: 'Code not found' }, { status: 404 })
  const secret = process.env.SESSION_SECRET
  if (!secret) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value ?? generateSessionToken(secret)
  await visitorDb.insert(schema.scans).values({ codeId: experience.code.id, campaignId: experience.campaign.id, sessionToken: token, ipHash: hashIp(requestIp(request), secret) })
  const response = NextResponse.json({ ok: true })
  if (!jar.get(COOKIE)) response.cookies.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: (process.env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https://'), maxAge: 60 * 60 * 24 * 30, path: '/' })
  return response
}
