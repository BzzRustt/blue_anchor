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

/** One pinned API version so Stripe changing its defaults can never silently change behaviour. Confirm in the Stripe dashboard (Developers > API version). */
export const STRIPE_API_VERSION = '2024-06-20'

export const stripeHeaders = (key: string, idempotencyKey?: string): Record<string, string> => ({
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/x-www-form-urlencoded',
  'Stripe-Version': STRIPE_API_VERSION,
  ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
})

/**
 * Pro checkout key: one per user and customer per 2-minute window. A double click or retry inside the window gets
 * the same session back instead of creating a second; after the window a fresh attempt is allowed.
 */
export const proIdempotencyKey = (userId: string, customerId: string | null, nowMs = Date.now()) => `pro_${userId}_${customerId ?? 'new'}_${Math.floor(nowMs / 120_000)}`

export function checkoutBody(input: { amountPence: number; currency: string; productName: string; purchaseId: string; successUrl: string; cancelUrl: string }) {
  return new URLSearchParams({
    mode: 'payment',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.purchaseId,
    // Gives the organiser a Stripe invoice/receipt. Deliberately NO automatic_tax / VAT settings here: that needs the accountant's decision first.
    'invoice_creation[enabled]': 'true',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': input.currency,
    'line_items[0][price_data][unit_amount]': String(input.amountPence),
    'line_items[0][price_data][product_data][name]': input.productName,
  })
}

export function proCheckoutBody(input: { userId: string; email: string; customerId: string | null; priceId: string; successUrl: string; cancelUrl: string }) {
  const body = new URLSearchParams({
    mode: 'subscription',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    'line_items[0][price]': input.priceId,
    'line_items[0][quantity]': '1',
    // Lets customer.subscription.updated activate Pro later (3-D Secure / delayed payment) without the checkout event.
    'subscription_data[metadata][user_id]': input.userId,
  })
  if (input.customerId) body.set('customer', input.customerId)
  else body.set('customer_email', input.email)
  return body
}

/** POST to Stripe. On failure logs only the path, HTTP status and Stripe's error type/code: never the key or request body. */
async function stripePost(path: string, body: URLSearchParams, idempotencyKey?: string): Promise<Record<string, unknown> | null> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  try {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: 'POST',
      headers: stripeHeaders(key, idempotencyKey),
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const err = ((await res.json().catch(() => null)) as { error?: { type?: string; code?: string } } | null)?.error
      console.error(`[stripe] ${path} failed: status ${res.status} type ${err?.type ?? '-'} code ${err?.code ?? '-'}`)
      return null
    }
    return (await res.json()) as Record<string, unknown>
  } catch (e) {
    console.error(`[stripe] ${path} request error: ${e instanceof Error ? e.name : 'unknown'}`)
    return null
  }
}

export async function createCheckoutSession(input: Parameters<typeof checkoutBody>[0]): Promise<{ id: string; url: string } | null> {
  const json = await stripePost('checkout/sessions', checkoutBody(input), input.purchaseId)
  return typeof json?.id === 'string' && typeof json.url === 'string' ? { id: json.id, url: json.url } : null
}

/** Pro needs a Stripe Price id as well (decision D4 sets the amount in Stripe, not here). */
export const proConfigured = () => stripeConfigured() && Boolean(process.env.STRIPE_PRO_PRICE_ID)

/** Pro subscription checkout. client_reference_id carries the account id back to the webhook. */
export async function createProCheckout(input: { userId: string; email: string; customerId: string | null; successUrl: string; cancelUrl: string }) {
  if (!proConfigured()) return null
  const json = await stripePost('checkout/sessions', proCheckoutBody({ ...input, priceId: process.env.STRIPE_PRO_PRICE_ID! }), proIdempotencyKey(input.userId, input.customerId))
  return typeof json?.url === 'string' ? json.url : null
}

/** Stripe's hosted page to change card or cancel Pro. */
export async function createBillingPortal(customerId: string, returnUrl: string) {
  const json = await stripePost('billing_portal/sessions', new URLSearchParams({ customer: customerId, return_url: returnUrl }))
  return typeof json?.url === 'string' ? json.url : null
}

export type StripeEvent = { id?: string; type?: string; api_version?: string; data?: { object?: { id?: string; mode?: string; payment_status?: string; client_reference_id?: string; customer?: string; status?: string; subscription?: string; payment_intent?: string; refunded?: boolean; metadata?: { user_id?: string } } } }
export type StripeAction =
  | { kind: 'activate_pro'; userId: string; customerId: string; subscriptionId: string }
  | { kind: 'confirm_purchase'; sessionId: string; ref?: string }
  | { kind: 'deactivate_pro'; customerId: string }
  | { kind: 'refund_purchase'; paymentIntentId: string }
  | { kind: 'expire_purchase'; sessionId: string }
  | { kind: 'log_failure'; message: string }
  | { kind: 'ignore' }

/** Pure: what to do for a verified webhook event. handleStripeEvent executes the result. */
export function decideStripeAction(event: StripeEvent): StripeAction {
  const o = event.data?.object
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      if (!o?.id) return { kind: 'ignore' }
      if (o.mode === 'subscription') {
        return o.client_reference_id && o.customer && o.subscription && o.payment_status !== 'unpaid'
          ? { kind: 'activate_pro', userId: o.client_reference_id, customerId: o.customer, subscriptionId: o.subscription }
          : { kind: 'ignore' }
      }
      // Delayed methods complete as 'unpaid'; they are confirmed later by async_payment_succeeded.
      return o.payment_status === 'paid' ? { kind: 'confirm_purchase', sessionId: o.id, ref: o.client_reference_id } : { kind: 'ignore' }
    }
    case 'checkout.session.async_payment_failed':
    case 'invoice.payment_failed':
      // Safe line only: event id and type, no customer or card details. Pro is NOT removed: past_due keeps Pro while Stripe retries.
      return { kind: 'log_failure', message: `[stripe] ${event.type} event ${event.id ?? '-'}` }
    case 'checkout.session.expired':
      // Abandoned one-off checkout. A subscription session that expires never granted anything.
      return o?.id && o.mode !== 'subscription' ? { kind: 'expire_purchase', sessionId: o.id } : { kind: 'ignore' }
    case 'charge.refunded':
      // Only a FULL refund withdraws an event purchase; partial refunds change nothing. Pro is governed by the subscription, not refunds.
      return o?.refunded === true && o.payment_intent ? { kind: 'refund_purchase', paymentIntentId: o.payment_intent } : { kind: 'ignore' }
    case 'customer.subscription.deleted':
      return o?.customer ? { kind: 'deactivate_pro', customerId: o.customer } : { kind: 'ignore' }
    case 'customer.subscription.updated':
      // Became active/trialing later (3-D Secure, delayed payment): activate from the metadata set at checkout. No metadata: ignore.
      if (o?.id && o.customer && o.metadata?.user_id && ['active', 'trialing'].includes(o.status ?? ''))
        return { kind: 'activate_pro', userId: o.metadata.user_id, customerId: o.customer, subscriptionId: o.id }
      return o?.customer && ['canceled', 'unpaid', 'incomplete_expired'].includes(o.status ?? '')
        ? { kind: 'deactivate_pro', customerId: o.customer }
        : { kind: 'ignore' }
    default:
      return { kind: 'ignore' }
  }
}

type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
const LIVE = ['active', 'trialing', 'past_due']

/** GET from Stripe. Returns null on any failure (logs only path, status and error type/code: never the key or body). */
async function stripeGet(path: string, key: string, fetchImpl: FetchLike): Promise<Record<string, unknown> | null> {
  const label = path.split('?')[0]
  try {
    const res = await fetchImpl(`https://api.stripe.com/v1/${path}`, { headers: stripeHeaders(key), signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      const err = ((await res.json().catch(() => null)) as { error?: { type?: string; code?: string } } | null)?.error
      console.error(`[stripe] GET ${label} failed: status ${res.status} type ${err?.type ?? '-'} code ${err?.code ?? '-'}`)
      return null
    }
    return (await res.json()) as Record<string, unknown>
  } catch (e) {
    console.error(`[stripe] GET ${label} request error: ${e instanceof Error ? e.name : 'unknown'}`)
    return null
  }
}

/** The subscription's current status, or null if Stripe could not be asked. */
export async function fetchSubscription(id: string, key: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<{ status: string; priceIds: string[] } | null> {
  const j = await stripeGet(`subscriptions/${encodeURIComponent(id)}`, key, fetchImpl)
  if (!j || typeof j.status !== 'string') return null
  const items = (j.items as { data?: { price?: { id?: string } }[] } | undefined)?.data ?? []
  return { status: j.status, priceIds: items.map((i) => i.price?.id ?? '') }
}

/** True/false, or null if Stripe could not be asked (never guess). */
export async function customerHasLiveSubscription(customerId: string, key: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<boolean | null> {
  const j = await stripeGet(`subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`, key, fetchImpl)
  if (!j || !Array.isArray(j.data)) return null
  // Only Pro subscriptions count. ponytail: if STRIPE_PRO_PRICE_ID is unset, any live subscription counts.
  const priceId = process.env.STRIPE_PRO_PRICE_ID
  return j.data.some((s) => {
    const sub = s as { status?: string; items?: { data?: { price?: { id?: string } }[] } }
    return LIVE.includes(sub.status ?? '') && (!priceId || (sub.items?.data ?? []).some((i) => i.price?.id === priceId))
  })
}

/** The checkout session that took this payment: its id, '' if there is none, null if Stripe could not be asked. */
export async function sessionIdForPaymentIntent(paymentIntentId: string, key: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<string | null> {
  const j = await stripeGet(`checkout/sessions?payment_intent=${encodeURIComponent(paymentIntentId)}&limit=1`, key, fetchImpl)
  if (!j || !Array.isArray(j.data)) return null
  const first = j.data[0] as { id?: string } | undefined
  return first?.id ?? ''
}

/** SQLSTATE 42883 (undefined function) on the error or a nested cause, and a message that names confirm_event_purchase. */
export function isUndefinedFunction(err: unknown): boolean {
  let code = false
  let named = false
  let e = err as { code?: unknown; message?: unknown; cause?: unknown } | undefined
  for (let i = 0; e && typeof e === 'object' && i < 5; i++, e = e.cause as typeof e) {
    if (e.code === '42883') code = true
    if (typeof e.message === 'string' && e.message.includes('confirm_event_purchase')) named = true
  }
  return code && named
}

export type StripeDeps = {
  secretKey: string
  fetch: FetchLike
  activatePro: (userId: string, customerId: string) => Promise<unknown>
  deactivatePro: (customerId: string) => Promise<unknown>
  /** 2-argument SQL function (session id + our purchase id). */
  confirmPurchase: (sessionId: string, ref: string | null) => Promise<string | null>
  /** Full refund of an event payment, by checkout session id. */
  refundPurchase: (sessionId: string) => Promise<unknown>
  /** Abandoned checkout, by checkout session id. */
  expirePurchase: (sessionId: string) => Promise<unknown>
  /** Original 1-argument function, used until the new SQL is applied. */
  confirmPurchaseLegacy: (sessionId: string) => Promise<string | null>
  warn?: (message: string) => void
}
export type StripeResult = { status: number; body: string }

/**
 * Executes a verified event. Pro changes are re-checked against Stripe first, so a late or out-of-order
 * event can never switch Pro on for an ended subscription or off for a resubscribed customer.
 * A failed Stripe lookup answers 503 so Stripe retries later.
 */
export async function handleStripeEvent(event: StripeEvent, deps: StripeDeps): Promise<StripeResult> {
  if (event.api_version && event.api_version !== STRIPE_API_VERSION) (deps.warn ?? console.warn)(`[stripe] event ${event.id ?? '-'} api_version ${event.api_version} differs from pinned ${STRIPE_API_VERSION}`)
  const action = decideStripeAction(event)
  const retry: StripeResult = { status: 503, body: 'stripe lookup failed, retry' }
  switch (action.kind) {
    case 'activate_pro': {
      const s = await fetchSubscription(action.subscriptionId, deps.secretKey, deps.fetch)
      if (!s) return retry
      if (s.status === 'incomplete') return retry // 3-D Secure / payment still in progress: Stripe retries
      // Same rule as deactivation: only the Pro price grants Pro (any price when STRIPE_PRO_PRICE_ID is unset).
      const priceId = process.env.STRIPE_PRO_PRICE_ID
      const onProPrice = !priceId || s.priceIds.includes(priceId)
      if (LIVE.includes(s.status) && onProPrice) await deps.activatePro(action.userId, action.customerId)
      else (deps.warn ?? console.warn)(`[stripe] ${event.type} event ${event.id ?? '-'} subscription not Pro (status ${s.status}, on Pro price: ${onProPrice}), Pro not activated`)
      break
    }
    case 'deactivate_pro': {
      const live = await customerHasLiveSubscription(action.customerId, deps.secretKey, deps.fetch)
      if (live === null) return retry
      if (!live) await deps.deactivatePro(action.customerId)
      break
    }
    case 'confirm_purchase': {
      let id: string | null
      try {
        id = await deps.confirmPurchase(action.sessionId, action.ref ?? null)
      } catch (e) {
        if (!isUndefinedFunction(e)) throw e
        ;(deps.warn ?? console.warn)('[stripe] confirm_event_purchase(text,text) not applied, using legacy')
        id = await deps.confirmPurchaseLegacy(action.sessionId)
      }
      if (!id) (deps.warn ?? console.warn)(`[stripe] paid checkout session matched no pending purchase (already confirmed or not found): ${action.sessionId}`)
      break
    }
    case 'expire_purchase':
      await deps.expirePurchase(action.sessionId)
      break
    case 'refund_purchase': {
      const sessionId = await sessionIdForPaymentIntent(action.paymentIntentId, deps.secretKey, deps.fetch)
      if (sessionId === null) return retry
      if (sessionId) await deps.refundPurchase(sessionId)
      break
    }
    case 'log_failure':
      ;(deps.warn ?? console.warn)(action.message)
      break
  }
  return { status: 200, body: 'ok' }
}
