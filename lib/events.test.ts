/**
 * Run with: npm run test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  badgesCsv,
  eventSlug,
  formatTag,
  generateAccessCode,
  nextNumber,
  fromLocalInput,
  parseImport,
  parseRoles,
  parseRoster,
  toLocalInput,
} from './events.ts'

test('tags are letter plus three digits, or plain digits without roles', () => {
  assert.equal(formatTag('F', 42), 'F-042')
  assert.equal(formatTag('I', 7), 'I-007')
  assert.equal(formatTag(null, 5), '005')
  assert.equal(formatTag('F', 1000), 'F-1000', 'past 999 widens rather than collides')
})

test('numbering is per letter and ignores other roles and malformed tags', () => {
  const tags = ['F-001', 'F-002', 'I-009', '014', 'garbage']
  assert.equal(nextNumber(tags, 'F'), 3)
  assert.equal(nextNumber(tags, 'I'), 10)
  assert.equal(nextNumber(tags, 'M'), 1, 'an unused letter starts at 1')
  assert.equal(nextNumber(tags, null), 15, 'plain numbers are their own sequence')
  assert.equal(nextNumber([], 'F'), 1)
})

test('roles parse, upper-case, and reject duplicates and bad shapes', () => {
  assert.deepEqual(parseRoles('f=Founder, i=Investor').roles, [
    { letter: 'F', label: 'Founder' },
    { letter: 'I', label: 'Investor' },
  ])
  assert.equal(parseRoles('').roles.length, 0)
  assert.match(parseRoles('F=Founder, F=Funder').error ?? '', /used twice/)
  assert.match(parseRoles('Founder').error ?? '', /F=Founder/)
  assert.match(parseRoles('1=Nope').error ?? '', /not in the form/)
  const nine = 'ABCDEFGHI'.split('').map((l) => `${l}=Role`).join(',')
  assert.match(parseRoles(nine).error ?? '', /at most 8/)
})

test('a roster parses names with optional email and role letter', () => {
  const { rows, errors } = parseRoster(
    ['Ada Obi, ada@example.com, f', 'Tunde Bello', '', 'Chi Eze,,I'].join('\n'),
    ['F', 'I']
  )
  assert.deepEqual(errors, [])
  assert.deepEqual(rows, [
    { name: 'Ada Obi', email: 'ada@example.com', letter: 'F' },
    { name: 'Tunde Bello', email: null, letter: null },
    { name: 'Chi Eze', email: null, letter: 'I' },
  ])
})

test('a roster reports every bad line by number and keeps the good ones', () => {
  const { rows, errors } = parseRoster(
    ['A, a@x.com', 'Good Name, good@x.com', 'Bad Email, nope', 'Dup, good@x.com', 'Role Guy, r@x.com, Z'].join('\n'),
    ['F']
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'Good Name')
  assert.equal(errors.length, 4)
  assert.match(errors[0], /^Line 1:.*name/)
  assert.match(errors[1], /^Line 3:.*valid email/)
  assert.match(errors[2], /^Line 4:.*twice/)
  assert.match(errors[3], /^Line 5:.*roles/)
})

test('duplicate emails are caught regardless of case', () => {
  const { errors } = parseRoster('One One, A@X.com\nTwo Two, a@x.COM', [])
  assert.equal(errors.length, 1)
})

test('access codes avoid look-alike characters and are not constant', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 200; i++) {
    const code = generateAccessCode()
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}$/)
    seen.add(code)
  }
  assert.ok(seen.size > 190, 'codes should be effectively unique')
})

test('event slugs are readable, safe, and unguessable', () => {
  const slug = eventSlug('Wray Forward: Pitch Night!')
  assert.match(slug, /^wray-forward-pitch-night-[0-9a-f]{6}$/)
  assert.match(eventSlug('!!!'), /^event-[0-9a-f]{6}$/)
  assert.notEqual(eventSlug('Same'), eventSlug('Same'))
})

test('badge CSV quotes commas and quotes, and neutralises spreadsheet formulas', () => {
  const csv = badgesCsv(
    [
      { tag: 'F-001', name: 'Okafor, Ada "AK"', role: 'Founder', joinUrl: 'https://x.test/e/a/join?a=1' },
      { tag: 'F-002', name: '=HYPERLINK("http://evil")', role: 'Founder', joinUrl: 'https://x.test/e/a/join?a=2' },
      { tag: 'I-001', name: '+44 attacker', role: '@sum', joinUrl: 'https://x.test/e/a/join?a=3' },
    ],
    'K7Q2M'
  )
  const lines = csv.trim().split('\r\n')
  assert.equal(lines[0], 'tag,name,role,access_code,join_url')
  assert.equal(lines[1], 'F-001,"Okafor, Ada ""AK""",Founder,K7Q2M,https://x.test/e/a/join?a=1')
  assert.ok(lines[2].includes(`"'=HYPERLINK(""http://evil"")"`), 'formula is prefixed and quoted')
  assert.ok(lines[3].includes(`'+44 attacker`) && lines[3].includes(`'@sum`))
  assert.ok(csv.endsWith('\r\n'))
})

test('parseImport maps header columns, handles quotes and skips repeats', () => {
  const r = parseImport('First Name,Last Name,Email,Order ID\n"Ada","Obi",ada@x.test,A1\nTunde,Bello,tunde@x.test,A2\nAda,Obi,ADA@x.test,A3\n', [])
  assert.equal(r.errors.length, 0)
  assert.deepEqual(r.rows.map((x) => [x.name, x.email, x.ref]), [['Ada Obi', 'ada@x.test', 'A1'], ['Tunde Bello', 'tunde@x.test', 'A2']])
  assert.equal(r.skipped, 1)
})
test('parseImport without a header is name, email, letter; bad rows are errors', () => {
  const r = parseImport('Ada Obi,ada@x.test,F\nX,nope,Q', ['F'])
  assert.equal(r.rows.length, 1)
  assert.equal(r.errors.length, 1)
})
test('local time round trips through an IANA zone, including across DST', () => {
  for (const [local, tz] of [['2026-07-01T18:30', 'Europe/London'], ['2026-01-15T09:00', 'America/New_York'], ['2026-03-29T12:00', 'Europe/London']] as const) {
    assert.equal(toLocalInput(fromLocalInput(local, tz), tz), local)
  }
  assert.equal(fromLocalInput('2026-07-01T18:30', 'Europe/London').toISOString(), '2026-07-01T17:30:00.000Z')
})
