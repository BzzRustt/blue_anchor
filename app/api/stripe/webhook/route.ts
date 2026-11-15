import { sql } from 'drizzle-orm'
import { visitorDb } from '@/lib/db'
import { verifyStripeSignature } from '@/lib/stripe'

export const runtime = 'nodejs'

/**
 * Stripe calls this after payment. The signature is checked over the RAW body before anything is
 * read from it; only then does confirm_event_purchase() (idempotent, security definer) publish the
 * event. A replayed or duplicated webhook changes nothing.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return new Response('not configured', { status: 503 })
  const raw = await request.text()
  if (!verifyStripeSignature(raw, request.headers.get('stripe-signature'), secret)) return new Response('bad signature', { status: 400 })

  let event: { type?: string; data?: { object?: { id?: string; payment_status?: string } } }
  try { event = JSON.parse(raw) } catch { return new Response('bad json', { status: 400 }) }

  const object = event.data?.object
  if (event.type === 'checkout.session.completed' && object?.id && object.payment_status === 'paid') {
    await visitorDb.execute(sql`select confirm_event_purchase(${object.id}::text)`)
  }
  return new Response('ok')
}
