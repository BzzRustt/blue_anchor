import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CODE_ALPHABET, CODE_LENGTH, checkNickname, imageKind, shortCode } from './profile-rules.ts'

test('personal codes are short and use only easy-to-read characters', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 500; i++) {
    const code = shortCode()
    assert.equal(code.length, CODE_LENGTH)
    assert.ok([...code].every((c) => CODE_ALPHABET.includes(c)), code)
    assert.ok(!/[01lio]/.test(code), code)
    seen.add(code)
  }
  assert.ok(seen.size > 495, 'codes should not repeat')
})

test('nicknames: cleaned, bounded, and reserved words refused', () => {
  assert.deepEqual(checkNickname(' @Tito.Builds '), { ok: true, value: 'tito.builds' })
  assert.deepEqual(checkNickname(''), { ok: true, value: null })
  assert.equal(checkNickname('ab').ok, false)
  assert.equal(checkNickname('has space').ok, false)
  assert.equal(checkNickname('.dot').ok, false)
  assert.equal(checkNickname('a..b').ok, false)
  assert.equal(checkNickname('admin').ok, false)
  assert.equal(checkNickname('x'.repeat(21)).ok, false)
})

test('photos are recognised by their bytes, not their name', () => {
  assert.equal(imageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpeg')
  assert.equal(imageKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'png')
  assert.equal(imageKind(new TextEncoder().encode('RIFF1234WEBPVP8 ')), 'webp')
  assert.equal(imageKind(new TextEncoder().encode('<svg onload=alert(1)>')), null)
  assert.equal(imageKind(new TextEncoder().encode('MZ executable')), null)
})
