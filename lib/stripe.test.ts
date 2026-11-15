import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { verifyStripeSignature } from './stripe.ts'

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
