import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asVisibility, hashAccessToken, newAccessToken } from './attendee-access.ts'

test('access tokens are random, 64 hex chars, and hash matches sha256 hex', () => {
  const a = newAccessToken()
  const b = newAccessToken()
  assert.match(a.token, /^[0-9a-f]{64}$/)
  assert.notEqual(a.token, b.token)
  assert.equal(a.hash, hashAccessToken(a.token))
  assert.equal(hashAccessToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('unknown visibility falls back to full', () => {
  assert.equal(asVisibility('hidden'), 'hidden')
  assert.equal(asVisibility('everyone'), 'full')
})
