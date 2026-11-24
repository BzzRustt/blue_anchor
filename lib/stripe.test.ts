import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { STRIPE_API_VERSION, checkoutBody, decideStripeAction, proCheckoutBody, proIdempotencyKey, stripeHeaders, verifyStripeSignature, type StripeEvent } from './stripe.ts'

const secret = 'whsec_test'
const body = '{"id":"evt_1"}'
const now = 1_700_000_000_000
const sign = (t: number, b = body, s = secret) => `t=${t},v1=${createHmac('sha256', s).update(`${t}.${b}`).digest('hex')}`

test('accepts a correct signature', () => assert.ok(verifyStripeSignature(body, sign(now / 1000), secret, now)))
test('rejects a tampered body', () => assert.ok(!verifyStripeSignature(body + ' ', sign(now / 1000), secret, now)))
test('rejects the wrong secret', () => assert.ok(!verifyStripeSignature(body, sign(now / 1000, body, 'other'), secret, now)))
test('rejects a stale timestamp (replay)', () => assert.ok(!verifyStripeSignature(body, sign(now / 1000 - 3600), secret, now)))
test('rejects missing or malformed headers', () => {
  assert.ok(!verifyStripeSignature(body, null, secret, now))
  assert.ok(!verifyStripeSignature(body, 't=abc,v1=zz', secret, now))
})

const ev = (type: string, object: NonNullable<StripeEvent['data']>['object']): StripeEvent => ({ id: 'evt_1', type, data: { object } })
const sub = { id: 'cs_1', mode: 'subscription', client_reference_id: 'u1', customer: 'cus_1', payment_status: 'paid' }

test('paid one-off confirms the purchase', () =>
  assert.deepEqual(decideStripeAction(ev('checkout.session.completed', { id: 'cs_1', mode: 'payment', payment_status: 'paid' })), { kind: 'confirm_purchase', sessionId: 'cs_1' }))
test('unpaid one-off does not confirm', () =>
  assert.equal(decideStripeAction(ev('checkout.session.completed', { id: 'cs_1', mode: 'payment', payment_status: 'unpaid' })).kind, 'ignore'))
test('subscription checkout activates Pro', () =>
  assert.deepEqual(decideStripeAction(ev('checkout.session.completed', sub)), { kind: 'activate_pro', userId: 'u1', customerId: 'cus_1' }))
test('unpaid subscription checkout does not activate Pro', () =>
  assert.equal(decideStripeAction(ev('checkout.session.completed', { ...sub, payment_status: 'unpaid' })).kind, 'ignore'))
test('async payment succeeded confirms the purchase', () =>
  assert.deepEqual(decideStripeAction(ev('checkout.session.async_payment_succeeded', { id: 'cs_2', mode: 'payment', payment_status: 'paid' })), { kind: 'confirm_purchase', sessionId: 'cs_2' }))
test('async payment failed only logs, with no customer data', () => {
  const a = decideStripeAction(ev('checkout.session.async_payment_failed', { id: 'cs_2', customer: 'cus_secret' }))
  assert.equal(a.kind, 'log_failure')
  assert.ok(a.kind === 'log_failure' && !a.message.includes('cus_secret'))
})
test('invoice.payment_failed logs and keeps Pro', () =>
  assert.equal(decideStripeAction(ev('invoice.payment_failed', { customer: 'cus_1' })).kind, 'log_failure'))
test('subscription deleted removes Pro', () =>
  assert.deepEqual(decideStripeAction(ev('customer.subscription.deleted', { customer: 'cus_1' })), { kind: 'deactivate_pro', customerId: 'cus_1' }))
test('subscription updated: ended statuses remove Pro, live ones keep it', () => {
  for (const status of ['canceled', 'unpaid', 'incomplete_expired']) assert.equal(decideStripeAction(ev('customer.subscription.updated', { customer: 'cus_1', status })).kind, 'deactivate_pro')
  for (const status of ['active', 'past_due', 'trialing']) assert.equal(decideStripeAction(ev('customer.subscription.updated', { customer: 'cus_1', status })).kind, 'ignore')
})
test('unknown events are ignored', () => assert.equal(decideStripeAction(ev('charge.refunded', { id: 'x' })).kind, 'ignore'))

test('one-off checkout asks Stripe for an invoice and sets no tax', () => {
  const b = checkoutBody({ amountPence: 100, currency: 'gbp', productName: 'p', purchaseId: 'pid', successUrl: 's', cancelUrl: 'c' })
  assert.equal(b.get('invoice_creation[enabled]'), 'true')
  assert.ok(![...b.keys()].some((k) => k.includes('automatic_tax')))
})
test('pro checkout body uses the customer if known, else the email', () => {
  const base = { userId: 'u1', email: 'a@b.c', priceId: 'price_1', successUrl: 's', cancelUrl: 'c' }
  assert.equal(proCheckoutBody({ ...base, customerId: 'cus_1' }).get('customer'), 'cus_1')
  assert.equal(proCheckoutBody({ ...base, customerId: null }).get('customer_email'), 'a@b.c')
})
test('headers carry the pinned version and idempotency key', () => {
  const h = stripeHeaders('sk_test_x', 'k1')
  assert.equal(h['Stripe-Version'], STRIPE_API_VERSION)
  assert.equal(h['Idempotency-Key'], 'k1')
  assert.ok(!('Idempotency-Key' in stripeHeaders('sk_test_x')))
})
test('pro idempotency key is stable inside a 10-minute window and changes after it', () => {
  const t = 1_700_000_000_000
  assert.equal(proIdempotencyKey('u1', t), proIdempotencyKey('u1', t + 60_000))
  assert.notEqual(proIdempotencyKey('u1', t), proIdempotencyKey('u1', t + 600_000))
  assert.notEqual(proIdempotencyKey('u1', t), proIdempotencyKey('u2', t))
})
