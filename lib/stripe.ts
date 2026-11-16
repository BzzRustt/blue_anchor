/**
 * Stripe over plain fetch + node:crypto. No SDK: one POST to create a Checkout Session and one
 * HMAC to trust the webhook. Keys come from env (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) and are
 * never logged. Without them, payments report "not configured" and nothing can be published:
 * there is deliberately no bypass.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)

/** Verifies a `Stripe-Signature` header against the raw body. Rejects stale timestamps (replay). */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowMs = Date.now(), toleranceSec = 300): boolean {
  if (!header || !secret) return false
  const parts = header.split(',').map((p) => p.split('=') as [string, string])
  const t = parts.find(([k]) => k === 't')?.[1]
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false
  if (Math.abs(nowMs / 1000 - Number(t)) > toleranceSec) return false
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest()
  return sigs.some((sig) => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false
    return timingSafeEqual(expected, Buffer.from(sig, 'hex'))
  })
}

export async function createCheckoutSession(input: {
  amountPence: number
  currency: string
  productName: string
  purchaseId: string
  successUrl: string
  cancelUrl: string
}): Promise<{ id: string; url: string } | null> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  const body = new URLSearchParams({
    mode: 'payment',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.purchaseId,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': input.currency,
    'line_items[0][price_data][unit_amount]': String(input.amountPence),
    'line_items[0][price_data][product_data][name]': input.productName,
  })
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': input.purchaseId },
    body,
  })
  if (!res.ok) return null
  const json = (await res.json()) as { id?: string; url?: string }
  return json.id && json.url ? { id: json.id, url: json.url } : null
}

/** Pro needs a Stripe Price id as well (decision D4 sets the amount in Stripe, not here). */
export const proConfigured = () => stripeConfigured() && Boolean(process.env.STRIPE_PRO_PRICE_ID)

async function stripePost(path: string, body: URLSearchParams): Promise<Record<string, unknown> | null> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    console.error(`[stripe] ${path} failed with ${res.status}`)
    return null
  }
  return (await res.json()) as Record<string, unknown>
}

/** Pro subscription checkout. client_reference_id carries the account id back to the webhook. */
export async function createProCheckout(input: { userId: string; email: string; customerId: string | null; successUrl: string; cancelUrl: string }) {
  if (!proConfigured()) return null
  const body = new URLSearchParams({
    mode: 'subscription',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    'line_items[0][price]': process.env.STRIPE_PRO_PRICE_ID!,
    'line_items[0][quantity]': '1',
  })
  if (input.customerId) body.set('customer', input.customerId)
  else body.set('customer_email', input.email)
  const json = await stripePost('checkout/sessions', body)
  return typeof json?.url === 'string' ? json.url : null
}

/** Stripe's hosted page to change card or cancel Pro. */
export async function createBillingPortal(customerId: string, returnUrl: string) {
  const json = await stripePost('billing_portal/sessions', new URLSearchParams({ customer: customerId, return_url: returnUrl }))
  return typeof json?.url === 'string' ? json.url : null
}
