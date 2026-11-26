/**
 * Run with: npm run test
 *
 * Stubs globalThis.fetch so nothing leaves the machine and no API key is needed.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetPasswordEmail, sendEmail } from './email.ts'

process.env.RESEND_API_KEY = 'test-key'
process.env.EMAIL_FROM = 'ScanMe <no-reply@example.com>'

const realFetch = globalThis.fetch

interface Captured { url: string; headers: Record<string, string>; body: Record<string, unknown> }

function captureFetch(status = 200): Captured[] {
  const calls: Captured[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    })
    return { ok: status < 400, status, text: async () => 'detail' } as Response
  }) as typeof fetch
  return calls
}

test.afterEach(() => { globalThis.fetch = realFetch })

test('a send posts the expected payload to Resend', async () => {
  const calls = captureFetch()
  const result = await sendEmail({
    to: 'payload@example.com',
    subject: 'Subject',
    text: 'Plain',
    html: '<p>Rich</p>',
  })

  assert.equal(result, 'sent')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.resend.com/emails')
  assert.equal(calls[0].headers.authorization, 'Bearer test-key')
  assert.deepEqual(calls[0].body, {
    from: 'ScanMe <no-reply@example.com>',
    to: ['payload@example.com'],
    subject: 'Subject',
    text: 'Plain',
    html: '<p>Rich</p>',
  })
})

test('a recipient is throttled after three emails in the window', async () => {
  const calls = captureFetch()
  const send = () => sendEmail({ to: 'flood@example.com', subject: 's', text: 't', html: 'h' })

  assert.equal(await send(), 'sent')
  assert.equal(await send(), 'sent')
  assert.equal(await send(), 'sent')
  assert.equal(await send(), 'rate_limited', 'the fourth email to one address is dropped')
  assert.equal(calls.length, 3, 'the throttled email never reaches the network')
})

test('the throttle is per recipient, and case and padding cannot evade it', async () => {
  captureFetch()
  const send = (to: string) => sendEmail({ to, subject: 's', text: 't', html: 'h' })

  await send('casing@example.com')
  await send('  CASING@Example.com  ')
  await send('casing@EXAMPLE.com')
  assert.equal(await send('casing@example.com'), 'rate_limited')
  assert.equal(await send('someone-else@example.com'), 'sent', 'other recipients are unaffected')
})

test('a Resend rejection throws rather than reporting success', async () => {
  captureFetch(422)
  await assert.rejects(
    () => sendEmail({ to: 'rejected@example.com', subject: 's', text: 't', html: 'h' }),
    /Resend rejected the email \(422\)/
  )
})

test('a missing key is reported, not thrown, and nothing is sent', async () => {
  const calls = captureFetch()
  const key = process.env.RESEND_API_KEY
  delete process.env.RESEND_API_KEY
  try {
    assert.equal(await sendEmail({ to: 'nokey@example.com', subject: 's', text: 't', html: 'h' }), 'not_configured')
    assert.equal(calls.length, 0)
  } finally {
    process.env.RESEND_API_KEY = key
  }
})

test('the reset email carries the link in both the text and the html part', () => {
  const url = 'https://scanme.test/api/auth/reset-password/tok123?callbackURL=%2Freset-password'
  const email = resetPasswordEmail('Allen K.', url)

  assert.match(email.subject, /reset your scanme password/i)
  assert.ok(email.text.includes(url), 'plain text must contain the raw link')
  assert.ok(email.html.includes('&amp;') || !url.includes('&'), 'html must escape the link')
  assert.match(email.text, /Hi Allen K\.,/)
  assert.match(email.html, /Hi Allen K\.,/)
  assert.match(email.text, /expires in an hour/)
})

test('the reset email greets a nameless user without printing null', () => {
  for (const name of [null, undefined, '   ']) {
    const email = resetPasswordEmail(name, 'https://scanme.test/r/t')
    assert.match(email.text, /^Hi,/, `name ${JSON.stringify(name)} should fall back`)
    assert.doesNotMatch(email.html, /null|undefined/)
  }
})

test('a name cannot inject markup into the html part', () => {
  const email = resetPasswordEmail('<script>alert(1)</script>', 'https://scanme.test/r/t')
  assert.doesNotMatch(email.html, /<script>/)
  assert.match(email.html, /&lt;script&gt;/)
})

test('capture mode writes the email to the outbox file and never calls Resend', async () => {
  const { mkdtempSync, readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'scanme-outbox-'))
  const previous = { mode: process.env.EMAIL_MODE, file: process.env.EMAIL_OUTBOX_FILE }
  process.env.EMAIL_MODE = 'capture'
  process.env.EMAIL_OUTBOX_FILE = join(dir, 'emails.jsonl')
  try {
    const calls = captureFetch()
    const result = await sendEmail({ to: 'synthetic@demo.scanme.test', subject: 'Hello', text: 't', html: '<p>t</p>' })
    assert.equal(result, 'sent')
    assert.equal(calls.length, 0)
    const line = JSON.parse(readFileSync(process.env.EMAIL_OUTBOX_FILE, 'utf8').trim())
    assert.equal(line.to, 'synthetic@demo.scanme.test')
    assert.equal(line.subject, 'Hello')
  } finally {
    if (previous.mode === undefined) delete process.env.EMAIL_MODE; else process.env.EMAIL_MODE = previous.mode
    if (previous.file === undefined) delete process.env.EMAIL_OUTBOX_FILE; else process.env.EMAIL_OUTBOX_FILE = previous.file
  }
})
