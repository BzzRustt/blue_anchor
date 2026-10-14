import crypto from 'node:crypto'
import { and, eq, gte } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { schema, visitorDb } from '@/lib/db'
import { getVisitorExperience } from '@/lib/product'
import { submissionLimiter } from '@/lib/rate-limiter'
import { verifySessionToken } from '@/lib/session-token'

const bodySchema = z.object({ answers: z.record(z.string(), z.union([z.string().max(500), z.number()])) })

function requestIp(request: NextRequest) { return request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? request.headers.get('x-real-ip') ?? '0.0.0.0' }
function hashIp(ip: string, secret: string) { return crypto.createHmac('sha256', secret).update(ip).digest('hex') }

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const secret = process.env.SESSION_SECRET
  if (!secret) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  const token = (await cookies()).get('scanme_guest')?.value
  if (!token || verifySessionToken(token, secret) === null) return NextResponse.json({ error: 'Refresh the page before responding.' }, { status: 401 })
  const ipHash = hashIp(requestIp(request), secret)
  if (submissionLimiter.isLimited(ipHash)) return NextResponse.json({ error: 'Please wait before sending another response.' }, { status: 429 })
  const payload = bodySchema.safeParse(await request.json().catch(() => null))
  if (!payload.success) return NextResponse.json({ error: 'Check your answers and try again.' }, { status: 400 })
  const experience = await getVisitorExperience(code)
  if (!experience) return NextResponse.json({ error: 'This code is not active.' }, { status: 404 })

  const [blocked] = await visitorDb.select({ id: schema.blockedDevices.id }).from(schema.blockedDevices).where(and(eq(schema.blockedDevices.userId, experience.code.userId), eq(schema.blockedDevices.deviceHash, ipHash))).limit(1)
  if (blocked) return NextResponse.json({ error: 'Responses are not available from this device.' }, { status: 403 })

  const allowed = new Set(experience.blocks.map((block) => block.id))
  const answers = Object.fromEntries(Object.entries(payload.data.answers).filter(([key]) => allowed.has(key)))
  for (const block of experience.blocks) {
    const value = answers[block.id]
    if (block.required && (value === undefined || value === '')) return NextResponse.json({ error: 'Please answer every required question.' }, { status: 400 })
    if (block.type === 'scale' && value !== undefined) { const numeric = Number(value); if (!Number.isFinite(numeric) || numeric < (block.config.min ?? 1) || numeric > (block.config.max ?? 10)) return NextResponse.json({ error: 'One rating is outside the allowed range.' }, { status: 400 }) }
    if (block.type === 'choice' && value !== undefined && !(block.config.options ?? []).includes(String(value))) return NextResponse.json({ error: 'One answer is not an available choice.' }, { status: 400 })
  }

  if (experience.campaign.repeatPolicy !== 'always_open') {
    const conditions = [eq(schema.responses.codeId, experience.code.id), eq(schema.responses.sessionToken, token)]
    if (experience.campaign.repeatPolicy === 'once_per_day') { const today = new Date(); today.setHours(0, 0, 0, 0); conditions.push(gte(schema.responses.submittedAt, today)) }
    const [previous] = await visitorDb.select({ id: schema.responses.id }).from(schema.responses).where(and(...conditions)).limit(1)
    if (previous) return NextResponse.json({ error: 'You have already responded to this code.' }, { status: 409 })
  }

  await visitorDb.insert(schema.responses).values({ userId: experience.code.userId, codeId: experience.code.id, campaignId: experience.campaign.id, sessionToken: token, answers, deviceHash: ipHash })
  submissionLimiter.increment(ipHash)
  return NextResponse.json({ ok: true }, { status: 201 })
}
