import { sql } from 'drizzle-orm'
import { visitorDb } from '@/lib/db'
import { decideStripeAction, verifyStripeSignature, type StripeEvent } from '@/lib/stripe'

export const runtime = 'nodejs'

/**
 * Stripe calls this after payment. The signature is checked over the RAW body before anything is
 * read from it; only then does decideStripeAction() (pure, unit-tested) choose what to do. The SQL
 * functions are idempotent, so a replayed or duplicated webhook changes nothing.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return new Response('not configured', { status: 503 })
  const raw = await request.text()
  if (!verifyStripeSignature(raw, request.headers.get('stripe-signature'), secret)) return new Response('bad signature', { status: 400 })

  let event: StripeEvent
  try { event = JSON.parse(raw) } catch { return new Response('bad json', { status: 400 }) }

  const action = decideStripeAction(event)
  if (action.kind === 'activate_pro') await visitorDb.execute(sql`select activate_pro(${action.userId}::text, ${action.customerId}::text)`)
  else if (action.kind === 'confirm_purchase') await visitorDb.execute(sql`select confirm_event_purchase(${action.sessionId}::text)`)
  else if (action.kind === 'deactivate_pro') await visitorDb.execute(sql`select deactivate_pro(${action.customerId}::text)`)
  else if (action.kind === 'log_failure') console.warn(action.message)
  return new Response('ok')
}
