/**
 * Run with: npm run test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signAttendeeToken, verifyAttendeeToken } from './attendee-token.ts'

const SECRET = 'a-test-secret-that-is-long-enough-123456'
const ID = '0e178b08-6f92-4e27-9834-b94eb7d56992'
const OTHER = '11111111-2222-4333-8444-555555555555'
const IN_AN_HOUR = new Date(Date.now() + 3_600_000)

test('a signed token verifies back to the attendee it was issued for', () => {
  assert.equal(verifyAttendeeToken(signAttendeeToken(ID, IN_AN_HOUR, SECRET), SECRET), ID)
})

test('the id is normalised to lower case', () => {
  assert.equal(verifyAttendeeToken(signAttendeeToken(ID.toUpperCase(), IN_AN_HOUR, SECRET), SECRET), ID)
})

test('a token signed with a different secret is refused', () => {
  assert.equal(verifyAttendeeToken(signAttendeeToken(ID, IN_AN_HOUR, SECRET), 'another-secret-entirely-0000000000'), null)
})

test('swapping in another attendee id invalidates the signature', () => {
  const [version, , expiry, signature] = signAttendeeToken(ID, IN_AN_HOUR, SECRET).split('.')
  assert.equal(verifyAttendeeToken([version, OTHER, expiry, signature].join('.'), SECRET), null)
})

test('extending the expiry invalidates the signature', () => {
  const [version, id, , signature] = signAttendeeToken(ID, IN_AN_HOUR, SECRET).split('.')
  const later = (Date.now() + 99 * 86_400_000).toString(36)
  assert.equal(verifyAttendeeToken([version, id, later, signature].join('.'), SECRET), null)
})

test('an expired token is refused even though its signature is genuine', () => {
  const token = signAttendeeToken(ID, new Date(Date.now() - 1000), SECRET)
  assert.equal(verifyAttendeeToken(token, SECRET), null)
})

test('expiry is judged against the supplied clock', () => {
  const token = signAttendeeToken(ID, new Date('2026-11-20T21:00:00Z'), SECRET)
  assert.equal(verifyAttendeeToken(token, SECRET, Date.parse('2026-11-20T20:59:59Z')), ID)
  assert.equal(verifyAttendeeToken(token, SECRET, Date.parse('2026-11-20T21:00:01Z')), null)
})

test('garbage never throws and never verifies', () => {
  for (const junk of ['', 'x', 'a.b.c', '1.2.3.4', '1..2.3', `1.${ID}.zz.nothex`, `1.${ID}.${'9'.repeat(30)}.00`, '.'.repeat(40)]) {
    assert.equal(verifyAttendeeToken(junk, SECRET), null, JSON.stringify(junk))
  }
})

test('a non-uuid id cannot be signed', () => {
  assert.throws(() => signAttendeeToken('not-a-uuid', IN_AN_HOUR, SECRET))
})
