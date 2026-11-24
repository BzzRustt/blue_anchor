import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { STRIPE_API_VERSION, checkoutBody, decideStripeAction, handleStripeEvent, isUndefinedFunction, type StripeDeps, proCheckoutBody, proIdempotencyKey, stripeHeaders, verifyStripeSignature, type StripeEvent } from './stripe.ts'

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
const sub = { id: 'cs_1', mode: 'subscription', client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1', payment_status: 'paid' }

test('paid one-off confirms the purchase', () =>
  assert.deepEqual(decideStripeAction(ev('checkout.session.completed', { id: 'cs_1', mode: 'payment', payment_status: 'paid', client_reference_id: 'p1' })), { kind: 'confirm_purchase', sessionId: 'cs_1', ref: 'p1' }))
test('unpaid one-off does not confirm', () =>
  assert.equal(decideStripeAction(ev('checkout.session.completed', { id: 'cs_1', mode: 'payment', payment_status: 'unpaid' })).kind, 'ignore'))
test('subscription checkout activates Pro', () =>
  assert.deepEqual(decideStripeAction(ev('checkout.session.completed', sub)), { kind: 'activate_pro', userId: 'u1', customerId: 'cus_1', subscriptionId: 'sub_1' }))
test('unpaid subscription checkout does not activate Pro', () =>
  assert.equal(decideStripeAction(ev('checkout.session.completed', { ...sub, payment_status: 'unpaid' })).kind, 'ignore'))
test('async payment succeeded confirms the purchase', () =>
  assert.deepEqual(decideStripeAction(ev('checkout.session.async_payment_succeeded', { id: 'cs_2', mode: 'payment', payment_status: 'paid', client_reference_id: 'p2' })), { kind: 'confirm_purchase', sessionId: 'cs_2', ref: 'p2' }))
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
  const t = 1_700_000_040_000 // start of a 2-minute window
  assert.equal(proIdempotencyKey('u1', null, t), proIdempotencyKey('u1', null, t + 60_000))
  assert.notEqual(proIdempotencyKey('u1', null, t), proIdempotencyKey('u1', null, t + 120_000))
  assert.notEqual(proIdempotencyKey('u1', null, t), proIdempotencyKey('u2', null, t))
  assert.notEqual(proIdempotencyKey('u1', null, t), proIdempotencyKey('u1', 'cus_1', t))
  assert.ok(proIdempotencyKey('u1', null, t).includes('_new_'))
})

// ---- handleStripeEvent: no network, no database. Stripe is a fake `fetch`, the database is a call log. ----
type Fake = { calls: string[]; deps: StripeDeps; urls: string[] }
function fake(opts: { subs?: Record<string, string>; list?: string[]; stripeDown?: boolean; confirm2Error?: unknown; noMatch?: boolean; price?: string } = {}): Fake {
  const calls: string[] = []
  const urls: string[] = []
  const deps: StripeDeps = {
    secretKey: 'sk_test_x',
    fetch: async (url, init) => {
      urls.push(url)
      assert.equal(init.headers['Stripe-Version'], STRIPE_API_VERSION)
      if (opts.stripeDown) return { ok: false, status: 500, json: async () => ({ error: { type: 'api_error' } }) }
      const m = url.match(/subscriptions\/(sub_\w+)$/)
      if (m) return opts.subs?.[m[1]] ? { ok: true, status: 200, json: async () => ({ status: opts.subs![m[1]] }) } : { ok: false, status: 404, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ data: (opts.list ?? []).map((status) => ({ status, items: { data: [{ price: { id: opts.price ?? 'price_pro' } }] } })) }) }
    },
    activatePro: async (u, c) => { calls.push(`activate ${u} ${c}`) },
    deactivatePro: async (c) => { calls.push(`deactivate ${c}`) },
    confirmPurchase: async (s, r) => { calls.push(`confirm2 ${s} ${r}`); if (opts.confirm2Error) throw opts.confirm2Error; return opts.noMatch ? null : 'evt_row' },
    confirmPurchaseLegacy: async (s) => { calls.push(`confirm1 ${s}`); return opts.noMatch ? null : 'evt_row' },
    warn: (m) => { calls.push(`warn ${m}`) },
  }
  return { calls, deps, urls }
}

test('Pro checkout activates only when Stripe says the subscription is live', async () => {
  for (const status of ['active', 'trialing', 'past_due']) {
    const f = fake({ subs: { sub_1: status } })
    assert.deepEqual(await handleStripeEvent(ev('checkout.session.completed', sub), f.deps), { status: 200, body: 'ok' })
    assert.deepEqual(f.calls, ['activate u1 cus_1'])
  }
})
test('out of order: subscription already ended, late checkout.completed does not switch Pro on', async () => {
  const f = fake({ subs: { sub_1: 'canceled' } })
  assert.equal((await handleStripeEvent(ev('checkout.session.completed', sub), f.deps)).status, 200)
  assert.ok(f.calls.every((c) => c.startsWith('warn '))) // logs only, no activation
})
test('out of order: stale canceled event while the customer has another live subscription keeps Pro', async () => {
  const f = fake({ list: ['canceled', 'active'] })
  assert.equal((await handleStripeEvent(ev('customer.subscription.deleted', { customer: 'cus_1' }), f.deps)).status, 200)
  assert.deepEqual(f.calls, [])
  assert.ok(f.urls[0].includes('customer=cus_1'))
})
test('subscription ended with no live subscription left removes Pro', async () => {
  const f = fake({ list: ['canceled'] })
  await handleStripeEvent(ev('customer.subscription.updated', { customer: 'cus_1', status: 'canceled' }), f.deps)
  assert.deepEqual(f.calls, ['deactivate cus_1'])
})
test('Stripe lookup failure answers 503 and touches no database function', async () => {
  for (const e of [ev('checkout.session.completed', sub), ev('customer.subscription.deleted', { customer: 'cus_1' })]) {
    const f = fake({ stripeDown: true })
    assert.equal((await handleStripeEvent(e, f.deps)).status, 503)
    assert.deepEqual(f.calls, [])
  }
  const missing = fake({ subs: {} }) // 404 from Stripe
  assert.equal((await handleStripeEvent(ev('checkout.session.completed', sub), missing.deps)).status, 503)
  assert.deepEqual(missing.calls, [])
})
test('one-off purchase uses the 2-argument confirm with the purchase id', async () => {
  const f = fake()
  await handleStripeEvent(ev('checkout.session.completed', { id: 'cs_1', mode: 'payment', payment_status: 'paid', client_reference_id: 'p1' }), f.deps)
  assert.deepEqual(f.calls, ['confirm2 cs_1 p1'])
})
test('falls back to the 1-argument confirm when the new SQL is not applied (42883, however wrapped)', async () => {
  const wrapped = [{ code: '42883', message: 'function confirm_event_purchase(text, text) does not exist' }, { message: 'Failed query: select confirm_event_purchase($1::text, $2::text)', cause: { code: '42883' } }, { message: 'Failed query: select confirm_event_purchase($1)', cause: { message: 'x', cause: { code: '42883' } } }]
  for (const err of wrapped) {
    const f = fake({ confirm2Error: err })
    const e = ev('checkout.session.async_payment_succeeded', { id: 'cs_2', mode: 'payment', payment_status: 'paid', client_reference_id: 'p2' })
    assert.equal((await handleStripeEvent(e, f.deps)).status, 200)
    assert.deepEqual(f.calls, ['confirm2 cs_2 p2', 'warn [stripe] confirm_event_purchase(text,text) not applied, using legacy', 'confirm1 cs_2'])
  }
})
test('other database errors are not swallowed by the fallback', async () => {
  const f = fake({ confirm2Error: { code: '08006' } })
  await assert.rejects(handleStripeEvent(ev('checkout.session.completed', { id: 'cs_1', mode: 'payment', payment_status: 'paid' }), f.deps))
  assert.deepEqual(f.calls, ['confirm2 cs_1 null'])
  assert.ok(!isUndefinedFunction(new Error('boom')) && !isUndefinedFunction(undefined))
  assert.ok(!isUndefinedFunction({ code: '42883', message: 'function other() does not exist' }))
  assert.ok(!isUndefinedFunction(new Error('function confirm_event_purchase does not exist')))
})
test('earlier branches: unpaid ignored, failures only log, unknown events answer 200', async () => {
  const f = fake()
  assert.equal((await handleStripeEvent(ev('checkout.session.completed', { id: 'cs_1', mode: 'payment', payment_status: 'unpaid' }), f.deps)).status, 200)
  assert.equal((await handleStripeEvent(ev('invoice.payment_failed', { customer: 'cus_1' }), f.deps)).status, 200)
  assert.equal((await handleStripeEvent(ev('charge.refunded', { id: 'x' }), f.deps)).status, 200)
  assert.deepEqual(f.calls, ['warn [stripe] invoice.payment_failed event evt_1'])
  assert.deepEqual(f.urls, [])
})

test('checkout for Pro stores the user id on the subscription', () =>
  assert.equal(proCheckoutBody({ userId: 'u1', email: 'a@b.c', priceId: 'price_1', customerId: null, successUrl: 's', cancelUrl: 'c' }).get('subscription_data[metadata][user_id]'), 'u1'))
test('subscription updated to active/trialing with user metadata activates Pro; without metadata is ignored', () => {
  for (const status of ['active', 'trialing'])
    assert.deepEqual(decideStripeAction(ev('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status, metadata: { user_id: 'u1' } })), { kind: 'activate_pro', userId: 'u1', customerId: 'cus_1', subscriptionId: 'sub_1' })
  assert.equal(decideStripeAction(ev('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'active' })).kind, 'ignore')
})
test('delayed Pro: updated-to-active event is re-checked with Stripe, then activates', async () => {
  const f = fake({ subs: { sub_1: 'active' } })
  await handleStripeEvent(ev('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { user_id: 'u1' } }), f.deps)
  assert.deepEqual(f.calls, ['activate u1 cus_1'])
  const g = fake({ subs: { sub_1: 'canceled' } })
  await handleStripeEvent(ev('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { user_id: 'u1' } }), g.deps)
  assert.deepEqual(g.calls.filter((c) => c.startsWith('activate')), [])
})
test('checkout completed with an incomplete subscription answers 503; dead ones log and answer 200', async () => {
  const a = fake({ subs: { sub_1: 'incomplete' } })
  assert.equal((await handleStripeEvent(ev('checkout.session.completed', sub), a.deps)).status, 503)
  assert.deepEqual(a.calls, [])
  for (const status of ['canceled', 'incomplete_expired', 'unpaid']) {
    const f = fake({ subs: { sub_1: status } })
    assert.equal((await handleStripeEvent(ev('checkout.session.completed', sub), f.deps)).status, 200)
    assert.equal(f.calls.length, 1)
    assert.ok(f.calls[0].startsWith('warn ') && !f.calls[0].includes('cus_1'))
  }
})
test('only subscriptions on the Pro price count as live', async () => {
  const old = process.env.STRIPE_PRO_PRICE_ID
  try {
    process.env.STRIPE_PRO_PRICE_ID = 'price_pro'
    const other = fake({ list: ['active'], price: 'price_other' })
    await handleStripeEvent(ev('customer.subscription.deleted', { customer: 'cus_1' }), other.deps)
    assert.deepEqual(other.calls, ['deactivate cus_1'])
    const pro = fake({ list: ['active'], price: 'price_pro' })
    await handleStripeEvent(ev('customer.subscription.deleted', { customer: 'cus_1' }), pro.deps)
    assert.deepEqual(pro.calls, [])
    delete process.env.STRIPE_PRO_PRICE_ID // unset: any live subscription counts
    const any = fake({ list: ['active'], price: 'price_other' })
    await handleStripeEvent(ev('customer.subscription.deleted', { customer: 'cus_1' }), any.deps)
    assert.deepEqual(any.calls, [])
  } finally {
    if (old === undefined) delete process.env.STRIPE_PRO_PRICE_ID
    else process.env.STRIPE_PRO_PRICE_ID = old
  }
})
test('a paid session matching no pending purchase logs the session id only and answers 200', async () => {
  const f = fake({ noMatch: true })
  const r = await handleStripeEvent(ev('checkout.session.completed', { id: 'cs_9', mode: 'payment', payment_status: 'paid', client_reference_id: 'p9' }), f.deps)
  assert.equal(r.status, 200)
  assert.deepEqual(f.calls, ['confirm2 cs_9 p9', 'warn [stripe] paid checkout session matched no pending purchase (already confirmed or not found): cs_9'])
})
test('an event with a different api_version logs one warning and is still processed', async () => {
  const f = fake()
  const r = await handleStripeEvent({ ...ev('charge.refunded', { id: 'x' }), api_version: '2020-01-01' }, f.deps)
  assert.equal(r.status, 200)
  assert.equal(f.calls.length, 1)
  assert.ok(f.calls[0].includes('2020-01-01'))
  const same = fake()
  await handleStripeEvent({ ...ev('charge.refunded', { id: 'x' }), api_version: STRIPE_API_VERSION }, same.deps)
  assert.deepEqual(same.calls, [])
})
