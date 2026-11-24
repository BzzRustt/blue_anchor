import { sql } from 'drizzle-orm'
import { visitorDb } from '@/lib/db'
import { handleStripeEvent, verifyStripeSignature, type StripeEvent } from '@/lib/stripe'

export const runtime = 'nodejs'

/**
 * Stripe calls this after payment. The signature is checked over the RAW body before anything is
 * read from it; handleStripeEvent() (pure, unit-tested) then decides and acts. The SQL functions are
 * idempotent, so a replayed or duplicated webhook changes nothing.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const key = process.env.STRIPE_SECRET_KEY
  if (!secret || !key) return new Response('not configured', { status: 503 })
  const raw = await request.text()
  if (!verifyStripeSignature(raw, request.headers.get('stripe-signature'), secret)) return new Response('bad signature', { status: 400 })

  let event: StripeEvent
  try { event = JSON.parse(raw) } catch { return new Response('bad json', { status: 400 }) }

  const { status, body } = await handleStripeEvent(event, {
    secretKey: key,
    fetch,
    activatePro: (u, c) => visitorDb.execute(sql`select activate_pro(${u}::text, ${c}::text)`),
    deactivatePro: (c) => visitorDb.execute(sql`select deactivate_pro(${c}::text)`),
    confirmPurchase: (s, r) => visitorDb.execute(sql`select confirm_event_purchase(${s}::text, ${r}::text)`),
    confirmPurchaseLegacy: (s) => visitorDb.execute(sql`select confirm_event_purchase(${s}::text)`),
  })
  return new Response(body, { status })
}
