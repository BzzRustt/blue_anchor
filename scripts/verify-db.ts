/**
 * Verifies ScanMe's schema, constraints, role grants, and tenant isolation against Neon.
 * Run after `db:rls` and `db:provision-runtime`.
 */
import { neon } from '@neondatabase/serverless'
import { historyCutoff } from '../lib/plans.ts'

process.loadEnvFile('.env.local')

const ownerUrl = process.env.DATABASE_OWNER_URL
const appUrl = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL
const authUrl = process.env.AUTH_DATABASE_URL
const visitorUrl = process.env.VISITOR_DATABASE_URL

if (!ownerUrl || !appUrl || !authUrl || !visitorUrl) {
  console.error('DATABASE_OWNER_URL, APP_DATABASE_URL, AUTH_DATABASE_URL and VISITOR_DATABASE_URL are required.')
  process.exit(1)
}

const admin = neon(ownerUrl)
const app = neon(appUrl)
const auth = neon(authUrl)
const visitor = neon(visitorUrl)

let failures = 0

function check(label: string, passed: boolean, detail = '') {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!passed) failures++
}

async function isRejected(work: () => Promise<unknown>) {
  try {
    await work()
    return false
  } catch {
    return true
  }
}

const USER_A = 'verify-user-a'
const USER_B = 'verify-user-b'

async function cleanup() {
  await admin`DELETE FROM users WHERE id IN (${USER_A}, ${USER_B})`
}

await cleanup()

// Structure and policy coverage.
const tables = await admin`
  SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
         (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '__drizzle_migrations'
  ORDER BY c.relname
`

check('21 application tables exist', tables.length === 21, `found ${tables.length}`)
check(
  'RLS is enabled and forced on every application table',
  tables.every((table) => table.relrowsecurity && table.relforcerowsecurity),
  tables.filter((table) => !table.relrowsecurity || !table.relforcerowsecurity).map((table) => table.relname).join(', ') || 'all covered'
)
check(
  'every application table has at least one policy',
  tables.every((table) => table.policies > 0),
  tables.filter((table) => table.policies === 0).map((table) => table.relname).join(', ') || 'all covered'
)

const ext = await admin`SELECT installed_version FROM pg_available_extensions WHERE name = 'pg_session_jwt'`
check('pg_session_jwt is installed', Boolean(ext[0]?.installed_version), ext[0]?.installed_version ?? 'not installed')

// Runtime roles and grants.
const roles = await admin`
  SELECT rolname, rolcanlogin, rolbypassrls, rolsuper, rolcreatedb, rolcreaterole
  FROM pg_roles
  WHERE rolname IN ('app_user', 'auth_user', 'visitor_user')
  ORDER BY rolname
`
check('three runtime roles exist and can log in', roles.length === 3 && roles.every((role) => role.rolcanlogin))
check(
  'runtime roles cannot bypass RLS or administer Postgres',
  roles.every((role) => !role.rolbypassrls && !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole)
)

const [grantCheck] = await admin`
  SELECT
    has_table_privilege('app_user', 'codes', 'SELECT') AS app_codes,
    has_table_privilege('app_user', 'session', 'SELECT') AS app_sessions,
    has_table_privilege('auth_user', 'session', 'SELECT') AS auth_sessions,
    has_table_privilege('auth_user', 'codes', 'SELECT') AS auth_codes,
    has_column_privilege('visitor_user', 'users', 'name', 'SELECT') AS visitor_name,
    has_column_privilege('visitor_user', 'users', 'email', 'SELECT') AS visitor_email,
    has_column_privilege('visitor_user', 'responses', 'answers', 'SELECT') AS visitor_answers
`
check('app_user can query product data but not auth sessions', grantCheck.app_codes && !grantCheck.app_sessions)
check('auth_user can persist auth data but cannot query campaigns/codes', grantCheck.auth_sessions && !grantCheck.auth_codes)
check('visitor_user can read public names but not email or answers', grantCheck.visitor_name && !grantCheck.visitor_email && !grantCheck.visitor_answers)

const [[appIdentity], [authIdentity], [visitorIdentity]] = await Promise.all([
  app`SELECT current_user AS role, current_setting('request.jwt.claims', true) AS claims`,
  auth`SELECT current_user AS role`,
  visitor`SELECT current_user AS role`,
])
check('APP_DATABASE_URL uses app_user', appIdentity?.role === 'app_user', appIdentity?.role)
check('AUTH_DATABASE_URL uses auth_user', authIdentity?.role === 'auth_user', authIdentity?.role)
check('VISITOR_DATABASE_URL uses visitor_user', visitorIdentity?.role === 'visitor_user', visitorIdentity?.role)

// Seed two owners through the migration-only connection.
await admin`
  INSERT INTO users (id, email, name)
  VALUES
    (${USER_A}, 'verify-a@example.test', 'Verify A'),
    (${USER_B}, 'verify-b@example.test', 'Verify B')
`
const [codeA, codeB] = await admin`
  INSERT INTO codes (user_id, slug)
  VALUES (${USER_A}, 'verify-a'), (${USER_B}, 'verify-b')
  RETURNING id, user_id
`
const [campaignA, campaignB] = await admin`
  INSERT INTO campaigns (user_id, code_id, mode, name, status)
  VALUES
    (${USER_A}, ${codeA.id}, 'networking', 'A live', 'live'),
    (${USER_B}, ${codeB.id}, 'networking', 'B live', 'live')
  RETURNING id, user_id
`
await admin`
  INSERT INTO question_blocks (campaign_id, type, position, required, config)
  VALUES (${campaignA.id}, 'open_text', 0, false, '{"prompt":"Hello A"}'::jsonb)
`

// Owner isolation: no claims means no rows; A's claim never reveals or writes B's data.
const withoutClaims = await app`SELECT id FROM users`
check('app_user sees no owner rows without verified claims', withoutClaims.length === 0, `${withoutClaims.length} visible`)

const [, ownUsers, ownCodes, otherCodes] = await app.transaction([
  app`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: USER_A })}, true)`,
  app`SELECT id FROM users`,
  app`SELECT id FROM codes WHERE user_id = ${USER_A}`,
  app`SELECT id FROM codes WHERE user_id = ${USER_B}`,
])
check('owner A can read their own row', ownUsers.length === 1 && ownUsers[0].id === USER_A)
check('owner A can read their own code', ownCodes.length === 1)
check('owner A cannot read owner B code', otherCodes.length === 0)

const crossOwnerWriteRejected = await isRejected(() => app.transaction([
  app`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: USER_A })}, true)`,
  app`INSERT INTO codes (user_id, slug) VALUES (${USER_B}, 'verify-cross-owner')`,
]))
check('owner A cannot write owner B data', crossOwnerWriteRejected)

// Auth role access and public visitor column boundary.
const authUsers = await auth`SELECT id FROM users WHERE id IN (${USER_A}, ${USER_B})`
check('auth_user can resolve users for sign-in', authUsers.length === 2)
check('auth_user cannot query product tables', await isRejected(() => auth`SELECT id FROM codes LIMIT 1`))

const publicOwner = await visitor`SELECT id, name FROM users WHERE id = ${USER_A}`
check('visitor_user can read a live public owner', publicOwner.length === 1 && publicOwner[0].name === 'Verify A')
check('visitor_user cannot read owner email', await isRejected(() => visitor`SELECT email FROM users WHERE id = ${USER_A}`))

await visitor`
  INSERT INTO scans (code_id, campaign_id, session_token, ip_hash)
  VALUES (${codeA.id}, ${campaignA.id}, 'visitor-scan', 'verify-hash')
`
await visitor`
  INSERT INTO responses (user_id, campaign_id, code_id, session_token, answers, device_hash)
  VALUES (${USER_A}, ${campaignA.id}, ${codeA.id}, 'visitor-response', '{"answer":"hello"}'::jsonb, 'verify-hash')
`
const visitorResponse = await visitor`SELECT id FROM responses WHERE code_id = ${codeA.id} AND session_token = 'visitor-response'`
check('visitor_user can submit and repeat-check a live response', visitorResponse.length === 1)
check('visitor_user cannot read response answers', await isRejected(() => visitor`SELECT answers FROM responses LIMIT 1`))

// M2: outbound click tracking, new public profile columns, Mode enum and config.
await visitor`
  INSERT INTO link_clicks (code_id, campaign_id, target, session_token)
  VALUES (${codeA.id}, ${campaignA.id}, 'instagram', 'visitor-click')
`
const storedClick = await admin`SELECT target FROM link_clicks WHERE code_id = ${codeA.id} AND session_token = 'visitor-click'`
check('visitor_user can record an outbound click on a live code', storedClick.length === 1)
check('visitor_user cannot read click rows', await isRejected(() => visitor`SELECT target FROM link_clicks LIMIT 1`))
check(
  'a click cannot name a campaign that belongs to another code',
  await isRejected(() => visitor`INSERT INTO link_clicks (code_id, campaign_id, target, session_token) VALUES (${codeA.id}, ${campaignB.id}, 'x', 'bad-click')`)
)
const [, clicksSeenByB] = await app.transaction([
  app`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: USER_B })}, true)`,
  app`SELECT id FROM link_clicks`,
])
check('owner B cannot read owner A clicks', clicksSeenByB.length === 0, `${clicksSeenByB.length} visible`)
const [, clicksSeenByA] = await app.transaction([
  app`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: USER_A })}, true)`,
  app`SELECT id FROM link_clicks`,
])
check('owner A can read their own clicks', clicksSeenByA.length === 1)
check('auth_user cannot query link_clicks', await isRejected(() => auth`SELECT id FROM link_clicks`))
const publicProfile = await visitor`SELECT interests, looking_for, can_offer, tiktok, youtube, spotify, portfolio_url FROM users WHERE id = ${USER_A}`
check('visitor_user can read the new public profile columns', publicProfile.length === 1)
const modeLabels = (await admin`SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'mode'`).map((row) => row.enumlabel)
check('mode enum includes basic and incognito', modeLabels.includes('basic') && modeLabels.includes('incognito'))
const [basicCampaign] = await admin`
  INSERT INTO campaigns (user_id, code_id, mode, name, status) VALUES (${USER_B}, ${codeB.id}, 'incognito', 'Incognito', 'draft') RETURNING config
`
check('a new campaign gets an empty config object by default', JSON.stringify(basicCampaign.config) === '{}')

// Core product constraints.
let secondLiveRejected = false
try {
  await admin`
    INSERT INTO campaigns (user_id, code_id, mode, name, status)
    VALUES (${USER_A}, ${codeA.id}, 'private', 'Second live', 'live')
  `
} catch {
  secondLiveRejected = true
}
check('a second live campaign on one code is rejected', secondLiveRejected)

let draftAllowed = true
try {
  await admin`
    INSERT INTO campaigns (user_id, code_id, mode, name, status)
    VALUES (${USER_A}, ${codeA.id}, 'private', 'A draft', 'draft')
  `
} catch {
  draftAllowed = false
}
check('multiple non-live campaigns on one code are allowed', draftAllowed)

await admin`
  INSERT INTO responses (user_id, campaign_id, code_id, session_token, submitted_at)
  VALUES
    (${USER_A}, ${campaignA.id}, ${codeA.id}, 'tok-old', now() - interval '31 days'),
    (${USER_A}, ${campaignA.id}, ${codeA.id}, 'tok-fresh', now() - interval '2 days')
`

const cutoff = historyCutoff('free')!
const visibleToFree = await admin`
  SELECT session_token FROM responses
  WHERE user_id = ${USER_A} AND submitted_at >= ${cutoff.toISOString()}
`
check('free plan cutoff excludes the 31-day response', visibleToFree.some((row) => row.session_token === 'tok-fresh') && !visibleToFree.some((row) => row.session_token === 'tok-old'))

await admin`DELETE FROM campaigns WHERE id = ${campaignA.id}`
const survived = await admin`SELECT campaign_id FROM responses WHERE user_id = ${USER_A}`
check('deleting a campaign keeps response history', survived.length >= 3 && survived.every((row) => row.campaign_id === null))

await admin`DELETE FROM codes WHERE id = ${codeA.id}`
const afterCodeDelete = await admin`SELECT count(*)::int AS n FROM responses WHERE user_id = ${USER_A}`
check('deleting a code cascades its responses', afterCodeDelete[0].n === 0, `${afterCodeDelete[0].n} remaining`)

// ───────────────────────── Events layer ──────────────────────────────────────
//
// Two organisers, two events. The single-tenant shape of the checks above cannot
// see a missing owner predicate, which is the bug class that reached main once
// already (docs/CODE_REVIEW-2026-10-12.md, finding 2).

const claims = (userId: string) => JSON.stringify({ sub: userId, role: 'authenticated' })
const attendeeClaims = (attendeeId: string) => JSON.stringify({ attendee: attendeeId })

async function seedEvent(userId: string, slug: string, name: string, expiresIn: string) {
  const [code] = await admin`
    INSERT INTO codes (user_id, slug, kind) VALUES (${userId}, ${slug}, 'event') RETURNING id
  `
  const [campaign] = await admin`
    INSERT INTO campaigns (user_id, code_id, mode, name, status)
    VALUES (${userId}, ${code.id}, 'event', ${name}, 'live') RETURNING id
  `
  const [event] = await admin`
    INSERT INTO events (user_id, code_id, campaign_id, name, starts_at, ends_at,
                        access_code, directory_expires_at)
    VALUES (${userId}, ${code.id}, ${campaign.id}, ${name}, now() - interval '1 day',
            now(), 'LETMEIN', now() + ${expiresIn}::interval)
    RETURNING id
  `
  return { codeId: code.id, campaignId: campaign.id, eventId: event.id }
}

const eventA = await seedEvent(USER_A, 'verify-event-a', 'Event A', '2 days')
const eventB = await seedEvent(USER_B, 'verify-event-b', 'Event B', '2 days')

const [attendeeA1] = await admin`
  INSERT INTO event_attendees (event_id, tag, role_letter, display_name, email, answers, status)
  VALUES (${eventA.eventId}, 'F-001', 'F', 'Ada Founder', 'ada@example.test',
          '{"looking_for":"pre-seed investors"}'::jsonb, 'complete')
  RETURNING id
`
const [attendeeA2] = await admin`
  INSERT INTO event_attendees (event_id, tag, role_letter, display_name, email, status)
  VALUES (${eventA.eventId}, 'I-001', 'I', 'Ivan Investor', 'ivan@example.test', 'complete')
  RETURNING id
`
await admin`
  INSERT INTO event_attendees (event_id, tag, display_name, email, status)
  VALUES (${eventB.eventId}, 'F-001', 'Bea Founder', 'bea@example.test', 'complete')
`

check(
  'the same tag may be reused across different events',
  true,
  'F-001 exists in both A and B'
)

const dupTagRejected = await isRejected(() => admin`
  INSERT INTO event_attendees (event_id, tag, display_name, status)
  VALUES (${eventA.eventId}, 'F-001', 'Duplicate', 'complete')
`)
check('a duplicate tag within one event is rejected', dupTagRejected)

// Organiser isolation.
const [, ownEvents, otherEvents, otherAttendees] = await app.transaction([
  app`SELECT set_config('request.jwt.claims', ${claims(USER_A)}, true)`,
  app`SELECT id FROM events`,
  app`SELECT id FROM events WHERE id = ${eventB.eventId}`,
  app`SELECT id FROM event_attendees WHERE event_id = ${eventB.eventId}`,
])
check('organiser A sees only their own event', ownEvents.length === 1, `${ownEvents.length} visible`)
check('organiser A cannot read organiser B event', otherEvents.length === 0)
check('organiser A cannot read organiser B attendees', otherAttendees.length === 0)

const crossOrganiserWriteRejected = await isRejected(() => app.transaction([
  app`SELECT set_config('request.jwt.claims', ${claims(USER_A)}, true)`,
  app`UPDATE event_attendees SET display_name = 'hijacked' WHERE event_id = ${eventB.eventId}`,
]))
const hijacked = await admin`
  SELECT display_name FROM event_attendees WHERE event_id = ${eventB.eventId}
`
check(
  'organiser A cannot write organiser B attendees',
  crossOrganiserWriteRejected || hijacked.every((row) => row.display_name !== 'hijacked'),
  hijacked.map((row) => row.display_name).join(', ')
)

// Attendee-facing reads.
const publicCard = await visitor`
  SELECT tag, role_letter, display_name, answers FROM event_attendees
  WHERE event_id = ${eventA.eventId} ORDER BY tag
`
check('an attendee can read the live directory', publicCard.length === 2, `${publicCard.length} cards`)
check(
  'the directory carries the answers that drive search',
  publicCard.some((row) => JSON.stringify(row.answers).includes('pre-seed')),
)

const emailBlocked = await isRejected(() => visitor`
  SELECT email FROM event_attendees WHERE event_id = ${eventA.eventId}
`)
check('an attendee cannot read another attendee email', emailBlocked)

const claimTokenBlocked = await isRejected(() => visitor`
  SELECT claim_token FROM event_attendees WHERE event_id = ${eventA.eventId}
`)
check('an attendee cannot read claim tokens', claimTokenBlocked)

// Self-edit requires a verified attendee claim for that exact row.
const [, selfEdited] = await visitor.transaction([
  visitor`SELECT set_config('request.jwt.claims', ${attendeeClaims(attendeeA1.id)}, true)`,
  visitor`UPDATE event_attendees SET display_name = 'Ada Updated' WHERE id = ${attendeeA1.id} RETURNING id`,
])
check('an attendee can edit their own card', selfEdited.length === 1)

const [, hijackAttempt] = await visitor.transaction([
  visitor`SELECT set_config('request.jwt.claims', ${attendeeClaims(attendeeA1.id)}, true)`,
  visitor`UPDATE event_attendees SET display_name = 'hijacked' WHERE id = ${attendeeA2.id} RETURNING id`,
])
check('an attendee cannot edit another attendee card', hijackAttempt.length === 0)

const anonEdit = await visitor`
  UPDATE event_attendees SET display_name = 'anon' WHERE id = ${attendeeA1.id} RETURNING id
`
check('an edit without a verified attendee claim changes nothing', anonEdit.length === 0)

// Reactions stay private to the recipient.
await admin`
  INSERT INTO reactions (event_id, attendee_id, from_attendee_id, kind)
  VALUES (${eventA.eventId}, ${attendeeA2.id}, ${attendeeA1.id}, 'applaud')
`
const [, ownReactions, othersReactions] = await visitor.transaction([
  visitor`SELECT set_config('request.jwt.claims', ${attendeeClaims(attendeeA1.id)}, true)`,
  visitor`SELECT id FROM reactions WHERE from_attendee_id = ${attendeeA1.id}`,
  visitor`SELECT id FROM reactions WHERE attendee_id = ${attendeeA2.id} AND from_attendee_id <> ${attendeeA1.id}`,
])
check('an attendee can see reactions they gave', ownReactions.length === 1)
check('an attendee cannot read the tally on someone else card', othersReactions.length === 0)

// A connect request must come from the verified sender.
const spoofedConnect = await isRejected(() => visitor.transaction([
  visitor`SELECT set_config('request.jwt.claims', ${attendeeClaims(attendeeA1.id)}, true)`,
  visitor`INSERT INTO connection_requests (event_id, from_attendee_id, to_attendee_id)
          VALUES (${eventA.eventId}, ${attendeeA2.id}, ${attendeeA1.id})`,
]))
check('a connect request cannot be sent on another attendee behalf', spoofedConnect)

// Joining an event: register_attendee() and join_event_info() are the only way in.
const eventC = await seedEvent(USER_B, 'verify-event-c', 'Event C', '2 days')
const eventD = await seedEvent(USER_B, 'verify-event-d', 'Event D', '-1 hour')
await admin`
  UPDATE events SET role_set = '[{"letter":"F","label":"Founder"},{"letter":"I","label":"Investor"}]'::jsonb
  WHERE id = ${eventC.eventId}
`

const register = (eventId: string, name: string, letter: string | null, max = 50, answers = '{}') => visitor`
  SELECT attendee_id, attendee_tag FROM register_attendee(
    ${eventId}::uuid, ${name}, ${letter}, ${answers}::jsonb, ${max}::integer)
`

const info = await visitor`SELECT * FROM join_event_info('verify-event-c')`
check('join_event_info returns an open event to a visitor', info.length === 1 && info[0].event_name === 'Event C')
check(
  'join_event_info exposes no email, claim or access code',
  info.length === 1 && !Object.keys(info[0]).some((key) => /email|claim|access/.test(key)),
  Object.keys(info[0] ?? {}).join(', ')
)
check('join_event_info reports the organiser plan the cap is computed from', info[0]?.organiser_plan === 'free')
check(
  'a nonexistent and an expired event look identical to a visitor',
  (await visitor`SELECT 1 FROM join_event_info('no-such-event')`).length === 0 &&
    (await visitor`SELECT 1 FROM join_event_info('verify-event-d')`).length === 0
)

await admin`UPDATE codes SET is_live = false WHERE id = ${eventC.codeId}`
check(
  'taking the code offline closes joining',
  (await visitor`SELECT 1 FROM join_event_info('verify-event-c')`).length === 0 &&
    (await isRejected(() => register(eventC.eventId, 'Offline Person', 'F')))
)
await admin`UPDATE codes SET is_live = true WHERE id = ${eventC.codeId}`

const f1 = await register(eventC.eventId, 'Ada Obi', 'F', 50, '{"q":"fintech"}')
const f2 = await register(eventC.eventId, 'Tunde Bello', 'F')
const i1 = await register(eventC.eventId, 'Ivan Investor', 'I')
check(
  'registration allocates the next tag per role',
  f1[0].attendee_tag === 'F-001' && f2[0].attendee_tag === 'F-002' && i1[0].attendee_tag === 'I-001',
  [f1, f2, i1].map((r) => r[0]?.attendee_tag).join(', ')
)

const stored = await admin`
  SELECT status, source, answers FROM event_attendees WHERE id = ${f1[0].attendee_id}
`
check(
  'a registered attendee is stored complete, native and with their answers',
  stored[0].status === 'complete' && stored[0].source === 'native' && JSON.stringify(stored[0].answers).includes('fintech')
)

check('a role is required when the event has roles', await isRejected(() => register(eventC.eventId, 'No Role', null)))
check('a role outside the event set is refused', await isRejected(() => register(eventC.eventId, 'Wrong Role', 'Z')))
check('a one-character name is refused', await isRejected(() => register(eventC.eventId, 'x', 'F')))
check('answers must be an object', await isRejected(() => register(eventC.eventId, 'Bad Answers', 'F', 50, '"just a string"')))

// Six people registering at the same instant must each get their own tag.
const burst = await Promise.all(Array.from({ length: 6 }, (_, n) => register(eventC.eventId, `Burst Person ${n}`, 'I')))
const burstTags = burst.map((r) => r[0].attendee_tag)
check(
  'simultaneous registrations never share a tag',
  new Set(burstTags).size === 6 && burstTags.every((tag) => /^I-\d{3}$/.test(tag)),
  burstTags.join(', ')
)

const seeded = await admin`SELECT count(*)::int AS n FROM event_attendees WHERE event_id = ${eventC.eventId}`
check(
  'registration is refused once the plan cap is reached',
  await isRejected(() => register(eventC.eventId, 'One Too Many', 'F', seeded[0].n)),
  `${seeded[0].n} attendees, cap ${seeded[0].n}`
)
check('registration into a closed event is refused', await isRejected(() => register(eventD.eventId, 'Late Arrival', null)))

check(
  'a visitor can no longer insert attendee rows directly',
  await isRejected(() => visitor`
    INSERT INTO event_attendees (event_id, tag, display_name, status)
    VALUES (${eventC.eventId}, 'F-900', 'Direct Insert', 'complete')
  `)
)
check(
  'only the visitor role can call the join functions',
  (await isRejected(() => auth`SELECT * FROM join_event_info('verify-event-c')`)) &&
    (await isRejected(() => auth`SELECT * FROM register_attendee(${eventC.eventId}::uuid, 'Nope', 'F', '{}'::jsonb, 50)`))
)

// An imported attendee (status 'invited') must be able to load and complete their own card.
const [invited] = await admin`
  INSERT INTO event_attendees (event_id, tag, role_letter, display_name, email, source, status)
  VALUES (${eventC.eventId}, 'F-099', 'F', 'Imported Person', 'imported@example.test', 'import', 'invited')
  RETURNING id
`
const strangerView = await visitor`SELECT id FROM event_attendees WHERE id = ${invited.id}`
check('an invited card is invisible to the public directory', strangerView.length === 0)

const [, ownInvited, othersInvited] = await visitor.transaction([
  visitor`SELECT set_config('request.jwt.claims', ${attendeeClaims(invited.id)}, true)`,
  visitor`SELECT id, display_name FROM event_attendees WHERE id = ${invited.id}`,
  visitor`SELECT id FROM event_attendees WHERE id = ${f1[0].attendee_id} AND status <> 'complete'`,
])
check('an invited attendee can read their own card', ownInvited.length === 1 && ownInvited[0].display_name === 'Imported Person')
check('reading your own card does not open anyone else', othersInvited.length === 0)

const [, completed] = await visitor.transaction([
  visitor`SELECT set_config('request.jwt.claims', ${attendeeClaims(invited.id)}, true)`,
  visitor`UPDATE event_attendees SET answers = '{"q":"hello"}'::jsonb, status = 'complete'
          WHERE id = ${invited.id} RETURNING id`,
])
check('an invited attendee can complete their own card', completed.length === 1)

const [, withdrawn] = await visitor.transaction([
  visitor`SELECT set_config('request.jwt.claims', ${attendeeClaims(invited.id)}, true)`,
  visitor`UPDATE event_attendees SET status = 'withdrawn' WHERE id = ${invited.id} RETURNING id`,
])
const afterWithdraw = await visitor`SELECT id FROM event_attendees WHERE id = ${invited.id}`
check('a withdrawn card leaves the directory', withdrawn.length === 1 && afterWithdraw.length === 0)

const emailStillHidden = await isRejected(() => visitor.transaction([
  visitor`SELECT set_config('request.jwt.claims', ${attendeeClaims(invited.id)}, true)`,
  visitor`SELECT email FROM event_attendees WHERE id = ${invited.id}`,
]))
check('reading your own card still never exposes email', emailStillHidden)

// Expiry is enforced in the database, not only in application code.
await admin`
  UPDATE events SET directory_expires_at = now() - interval '1 hour' WHERE id = ${eventA.eventId}
`
const afterExpiry = await visitor`
  SELECT id FROM event_attendees WHERE event_id = ${eventA.eventId}
`
const eventAfterExpiry = await visitor`SELECT id FROM events WHERE id = ${eventA.eventId}`
check('the directory is dark once it expires', afterExpiry.length === 0, `${afterExpiry.length} still visible`)
check('the event itself is unreadable once it expires', eventAfterExpiry.length === 0)

// A claimed attendee keeps what they collected.
await admin`
  INSERT INTO connection_requests (event_id, from_attendee_id, to_attendee_id)
  VALUES (${eventA.eventId}, ${attendeeA1.id}, ${attendeeA2.id})
`
await admin`UPDATE event_attendees SET claimed_user_id = ${USER_A} WHERE id = ${attendeeA1.id}`
const keptAfterExpiry = await admin`
  SELECT cr.id FROM connection_requests cr
  JOIN event_attendees a ON a.id = cr.from_attendee_id
  WHERE a.claimed_user_id = ${USER_A}
`
check('a claimed attendee connections survive expiry', keptAfterExpiry.length === 1)

// An event code must not consume the organiser's personal code quota.
const personalCodes = await admin`
  SELECT count(*)::int AS n FROM codes WHERE user_id = ${USER_A} AND kind = 'personal'
`
const eventCodes = await admin`
  SELECT count(*)::int AS n FROM codes WHERE user_id = ${USER_A} AND kind = 'event'
`
check(
  'an event code is distinguishable from a personal code for plan metering',
  eventCodes[0].n === 1,
  `${personalCodes[0].n} personal, ${eventCodes[0].n} event`
)

// Role separation holds for the new tables too.
const authReachEvents = await isRejected(() => auth`SELECT id FROM events`)
check('auth_user cannot query event tables', authReachEvents)

await cleanup()
const leftover = await admin`SELECT count(*)::int AS n FROM users WHERE id IN (${USER_A}, ${USER_B})`
check('verification data is cleaned up', leftover[0].n === 0)
const orphanEvents = await admin`SELECT count(*)::int AS n FROM events WHERE name IN ('Event A', 'Event B')`
check('event data cascades away with its organiser', orphanEvents[0].n === 0, `${orphanEvents[0].n} left`)

console.log(failures === 0 ? '\nAll database checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
