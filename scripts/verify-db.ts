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

check('33 application tables exist', tables.length === 33, `found ${tables.length}`)
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
    has_column_privilege('visitor_user', 'responses', 'answers', 'SELECT') AS visitor_answers,
    has_function_privilege('visitor_user', 'public.confirm_event_purchase(text, text)', 'EXECUTE') AS visitor_confirm_purchase
`
check('app_user can query product data but not auth sessions', grantCheck.app_codes && !grantCheck.app_sessions)
check('auth_user can persist auth data but cannot query campaigns/codes', grantCheck.auth_sessions && !grantCheck.auth_codes)
check('visitor_user can execute the 2-argument confirm_event_purchase', grantCheck.visitor_confirm_purchase)
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

// M4: publishing. A draft is invisible to attendees; only the signed webhook path can publish.
const asB = (...q: ReturnType<typeof app>[]) => app.transaction([app`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: USER_B })}, true)`, ...q])
await admin`UPDATE events SET status = 'draft' WHERE id = ${eventC.eventId}`
check('a draft event is invisible to attendees', (await visitor`SELECT 1 FROM join_event_info('verify-event-c')`).length === 0 && (await isRejected(() => register(eventC.eventId, 'Early Bird', 'F'))))
check('an organiser cannot publish their own event by UPDATE', await isRejected(() => asB(app`UPDATE events SET status = 'published' WHERE id = ${eventC.eventId}`)))
check('an organiser cannot set capacity by UPDATE', await isRejected(() => asB(app`UPDATE events SET capacity = 1000 WHERE id = ${eventC.eventId}`)))
check('an organiser cannot insert an already-published event', await isRejected(() => asB(app`INSERT INTO events (user_id, code_id, campaign_id, name, starts_at, ends_at, access_code, directory_expires_at, status) SELECT user_id, code_id, campaign_id, 'X', now(), now(), 'ZZZZ', now(), 'published' FROM events WHERE id = ${eventC.eventId}`)))
const toAwait = await asB(app`SELECT event_set_status(${eventC.eventId}::uuid, 'awaiting_payment') AS ok`)
const toPub = await asB(app`SELECT event_set_status(${eventC.eventId}::uuid, 'published') AS ok`)
check('event_set_status allows draft to awaiting_payment but never to published', toAwait[1][0].ok === true && toPub[1][0].ok === false)
check('another organiser cannot change an event status', (await app.transaction([app`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: USER_A })}, true)`, app`SELECT event_set_status(${eventC.eventId}::uuid, 'cancelled') AS ok`]))[1][0].ok === false)
await asB(app`INSERT INTO event_purchases (event_id, user_id, package_key, capacity, amount_pence, stripe_session_id) VALUES (${eventC.eventId}, ${USER_B}, 'p50', 2, 2900, 'cs_verify_1')`)
check('an organiser cannot insert a purchase as already paid', await isRejected(() => asB(app`INSERT INTO event_purchases (event_id, user_id, package_key, capacity, amount_pence, status) VALUES (${eventC.eventId}, ${USER_B}, 'p50', 9999, 0, 'paid')`)))
const [, [ownPending]] = await asB(app`INSERT INTO event_purchases (event_id, user_id, package_key, capacity, amount_pence) VALUES (${eventC.eventId}, ${USER_B}, 'p50', 2, 2900) RETURNING id`)
const savedSession = await asB(app`UPDATE event_purchases SET stripe_session_id = 'cs_verify_saved' WHERE id = ${ownPending.id} RETURNING id`)
check('an organiser can save the Stripe session id on their own pending purchase', savedSession[1].length === 1)
check('an organiser still cannot change a purchase status, capacity or amount', (await Promise.all([
  isRejected(() => asB(app`UPDATE event_purchases SET status = 'paid' WHERE id = ${ownPending.id}`)),
  isRejected(() => asB(app`UPDATE event_purchases SET capacity = 9999 WHERE id = ${ownPending.id}`)),
  isRejected(() => asB(app`UPDATE event_purchases SET amount_pence = 0 WHERE id = ${ownPending.id}`)),
])).every(Boolean))
const otherOrganiser = await app.transaction([app`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: USER_A })}, true)`, app`UPDATE event_purchases SET stripe_session_id = 'cs_verify_stolen' WHERE id = ${ownPending.id} RETURNING id`])
check("another organiser cannot touch someone else's purchase", otherOrganiser[1].length === 0)
check('an organiser cannot self-confirm a purchase', await isRejected(() => asB(app`SELECT confirm_event_purchase('cs_verify_1')`)))
const confirmed = await visitor`SELECT confirm_event_purchase('cs_verify_1') AS id`
const again = await visitor`SELECT confirm_event_purchase('cs_verify_1') AS id`
const [published] = await admin`SELECT status, capacity FROM events WHERE id = ${eventC.eventId}`
check('the webhook function publishes with the purchased capacity, once', confirmed[0].id === eventC.eventId && again[0].id === null && published.status === 'published' && published.capacity === 2, JSON.stringify(published))
check('a published event is reachable and reports its capacity', (await visitor`SELECT capacity FROM join_event_info('verify-event-c')`)[0]?.capacity === 2)

// Refunds and abandoned checkouts. The event's start time is moved around, then restored.
const [{ starts_at: originalStart }] = await admin`SELECT starts_at FROM events WHERE id = ${eventC.eventId}`
await admin`UPDATE events SET starts_at = now() + interval '7 days' WHERE id = ${eventC.eventId}`
check('an organiser cannot refund a purchase themselves', await isRejected(() => asB(app`SELECT refund_event_purchase('cs_verify_1')`)))
const refunded = await visitor`SELECT refund_event_purchase('cs_verify_1') AS id`
const refundedAgain = await visitor`SELECT refund_event_purchase('cs_verify_1') AS id`
const [afterRefund] = await admin`SELECT e.status, e.published_at, p.status AS purchase FROM events e JOIN event_purchases p ON p.event_id = e.id WHERE e.id = ${eventC.eventId} AND p.stripe_session_id = 'cs_verify_1'`
check('a full refund before the event starts returns it to draft and marks the purchase refunded, once',
  refunded[0].id === eventC.eventId && refundedAgain[0].id === null && afterRefund.status === 'draft' && afterRefund.published_at === null && afterRefund.purchase === 'refunded', JSON.stringify(afterRefund))
check('a refunded event is invisible to attendees again', (await visitor`SELECT 1 FROM join_event_info('verify-event-c')`).length === 0)
// A replayed payment confirmation must not bring a refunded purchase back.
check('a replayed confirmation cannot revive a refunded purchase', (await visitor`SELECT confirm_event_purchase('cs_verify_1') AS id`)[0].id === null)
// A refund after the event has started leaves the event published.
await admin`UPDATE event_purchases SET status = 'paid' WHERE stripe_session_id = 'cs_verify_1'`
await admin`UPDATE events SET status = 'published', capacity = 2, published_at = now(), starts_at = now() - interval '1 hour' WHERE id = ${eventC.eventId}`
await visitor`SELECT refund_event_purchase('cs_verify_1')`
const [afterLateRefund] = await admin`SELECT e.status, e.capacity, p.status AS purchase FROM events e JOIN event_purchases p ON p.event_id = e.id WHERE e.id = ${eventC.eventId} AND p.stripe_session_id = 'cs_verify_1'`
check('a refund after the event has started leaves it published', afterLateRefund.status === 'published' && afterLateRefund.capacity === 2 && afterLateRefund.purchase === 'refunded', JSON.stringify(afterLateRefund))
// Abandoned checkout.
await asB(app`INSERT INTO event_purchases (event_id, user_id, package_key, capacity, amount_pence, stripe_session_id) VALUES (${eventC.eventId}, ${USER_B}, 'p50', 2, 2900, 'cs_verify_expired')`)
check('an organiser cannot expire a purchase themselves', await isRejected(() => asB(app`SELECT expire_event_purchase('cs_verify_expired')`)))
const expired = await visitor`SELECT expire_event_purchase('cs_verify_expired') AS id`
const expiredAgain = await visitor`SELECT expire_event_purchase('cs_verify_expired') AS id`
const [expiredRow] = await admin`SELECT status FROM event_purchases WHERE stripe_session_id = 'cs_verify_expired'`
check('an abandoned checkout is marked failed, once, and a later payment cannot confirm it',
  expired[0].id !== null && expiredAgain[0].id === null && expiredRow.status === 'failed' && (await visitor`SELECT confirm_event_purchase('cs_verify_expired') AS id`)[0].id === null)
// Restore what the later checks expect: a published event with its original start.
await admin`UPDATE events SET status = 'published', capacity = 2, starts_at = ${originalStart} WHERE id = ${eventC.eventId}`

// M5: attendee access. The badge QR is not a login; access comes from personal links.
const { createHash } = await import('node:crypto')
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')
const asA = (...q: ReturnType<typeof app>[]) => app.transaction([app`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: USER_A })}, true)`, ...q])
check('visitors cannot read access tokens', await isRejected(() => visitor`SELECT id FROM attendee_access_tokens`))
check('the access code check is case-insensitive and never returns the code',
  (await visitor`SELECT event_access_code_ok(${eventA.eventId}::uuid, 'letmein') AS ok`)[0].ok === true &&
  (await visitor`SELECT event_access_code_ok(${eventA.eventId}::uuid, 'WRONG') AS ok`)[0].ok === false)
check('"already registered" with the wrong access code issues nothing',
  (await visitor`SELECT * FROM request_attendee_access(${eventA.eventId}::uuid, 'ada@example.test', 'WRONG')`).length === 0)
check('"already registered" with an unknown email issues nothing',
  (await visitor`SELECT * FROM request_attendee_access(${eventA.eventId}::uuid, 'nobody@example.test', 'LETMEIN')`).length === 0)
const emailed = await visitor`SELECT display_name, token FROM request_attendee_access(${eventA.eventId}::uuid, 'ADA@example.test', 'letmein')`
check('"already registered" issues one link per matching attendee', emailed.length === 1 && emailed[0].display_name === 'Ada Updated' &&/^[0-9a-f]{64}$/.test(emailed[0].token))
const redeem = async (slug: string, token: string) => (await visitor`SELECT redeem_attendee_access(${slug}, ${token}) AS id`)[0].id
check('a personal link redeems to its attendee on its own event', (await redeem('verify-event-a', emailed[0].token)) === attendeeA1.id)
check('a personal link does not work on another event', (await redeem('verify-event-b', emailed[0].token)) === null)
check('a made-up token redeems to nothing', (await redeem('verify-event-a', 'f'.repeat(64))) === null)
const orgToken = 'a'.repeat(64)
await asA(app`INSERT INTO attendee_access_tokens (attendee_id, event_id, token_hash, created_by, expires_at) VALUES (${attendeeA1.id}, ${eventA.eventId}, ${sha(orgToken)}, 'organiser', now() + interval '1 day')`)
check('an organiser-issued link redeems', (await redeem('verify-event-a', orgToken)) === attendeeA1.id)
check('another organiser cannot issue a link for my attendee', await isRejected(() => asB(app`INSERT INTO attendee_access_tokens (attendee_id, event_id, token_hash, created_by, expires_at) VALUES (${attendeeA1.id}, ${eventA.eventId}, ${sha('b'.repeat(64))}, 'organiser', now() + interval '1 day')`)))
check('an organiser cannot pose as an emailed link', await isRejected(() => asA(app`INSERT INTO attendee_access_tokens (attendee_id, event_id, token_hash, created_by, expires_at) VALUES (${attendeeA1.id}, ${eventA.eventId}, ${sha('c'.repeat(64))}, 'email', now() + interval '1 day')`)))
check('an organiser cannot rewrite a token hash', await isRejected(() => asA(app`UPDATE attendee_access_tokens SET token_hash = 'x' WHERE attendee_id = ${attendeeA1.id}`)))
check('another organiser sees none of my tokens', (await asB(app`SELECT id FROM attendee_access_tokens WHERE event_id = ${eventA.eventId}`))[1].length === 0)
await asA(app`UPDATE attendee_access_tokens SET revoked_at = now() WHERE attendee_id = ${attendeeA1.id} AND revoked_at IS NULL`)
check('revoked links stop working', (await redeem('verify-event-a', orgToken)) === null && (await redeem('verify-event-a', emailed[0].token)) === null)
await asA(app`INSERT INTO audit_log (user_id, event_id, action, target_id) VALUES (${USER_A}, ${eventA.eventId}, 'issue_access_link', ${attendeeA1.id})`)
check('the audit log is private to its organiser', (await asB(app`SELECT id FROM audit_log WHERE event_id = ${eventA.eventId}`))[1].length === 0)
check('the audit log cannot be edited or deleted', (await isRejected(() => asA(app`DELETE FROM audit_log WHERE user_id = ${USER_A}`))) && (await isRejected(() => asA(app`UPDATE audit_log SET action = 'x' WHERE user_id = ${USER_A}`))))
const [spare] = await admin`INSERT INTO event_attendees (event_id, tag, display_name, source, status) VALUES (${eventA.eventId}, '099', 'Walk-up', 'walk_up', 'invited') RETURNING id`
const claim = async (id: string) => (await visitor`SELECT claim_spare_tag(${eventA.eventId}::uuid, ${id}::uuid) AS ok`)[0].ok
check('a spare walk-up tag is claimed by its first scan only', (await claim(spare.id)) === true && (await claim(spare.id)) === false)
check('a real attendee badge can never be claimed', (await claim(attendeeA1.id)) === false)
check('a visitor can read the visibility choice of a public card', (await visitor`SELECT profile_visibility FROM event_attendees WHERE id = ${attendeeA1.id}`)[0]?.profile_visibility === 'full')

// M6 + M7: finding people, saved people, message requests. Event A is made live for these.
const asAtt = (id: string, ...q: ReturnType<typeof visitor>[]) => visitor.transaction([visitor`SELECT set_config('request.jwt.claims', ${attendeeClaims(id)}, true)`, ...q])
const ada = attendeeA1.id, ivan = attendeeA2.id
const [bea] = await admin`SELECT id FROM event_attendees WHERE event_id = ${eventB.eventId} LIMIT 1`
const [cara] = await admin`INSERT INTO event_attendees (event_id, tag, display_name, status) VALUES (${eventA.eventId}, 'C-001', 'Cara Coach', 'complete') RETURNING id`
const find = async (id: string, tag: string) => (await asAtt(id, visitor`SELECT * FROM attendee_find(${tag})`))[1] as Array<{ id: string; answers: Record<string, unknown> }>
await admin`UPDATE events SET ends_at = now() + interval '1 hour', discovery = 'badge', messaging_enabled = false, networking_opens_at = now() + interval '1 hour' WHERE id = ${eventA.eventId}`
check('badge search is closed until networking opens', await isRejected(() => find(ada, 'I-001')))
await admin`UPDATE events SET networking_opens_at = NULL, discovery = 'off' WHERE id = ${eventA.eventId}`
check('badge search is closed when the organiser turned discovery off', await isRejected(() => find(ada, 'I-001')))
await admin`UPDATE events SET discovery = 'badge' WHERE id = ${eventA.eventId}`
check('someone who is not an attendee cannot search', await isRejected(() => visitor`SELECT * FROM attendee_find('I-001')`))
const byTag = await find(ada, 'i001')
check('badge search finds a person by tag, with their answers on a full card', byTag.length === 1 && byTag[0].id === ivan)
check('badge search by number never returns yourself', (await find(ada, '1')).every((r) => r.id !== ada))
await admin`UPDATE event_attendees SET profile_visibility = 'name', answers = '{"x":"secret"}'::jsonb WHERE id = ${ivan}`
check('a name-only card comes back without answers', JSON.stringify((await find(ada, 'I-001'))[0]?.answers) === '{}')
await admin`UPDATE event_attendees SET profile_visibility = 'hidden' WHERE id = ${ivan}`
check('a hidden card never appears in search', (await find(ada, 'I-001')).length === 0)
await admin`UPDATE event_attendees SET profile_visibility = 'full' WHERE id = ${ivan}`
check('every search is logged, misses too', (await find(ada, 'Z-999')).length === 0 && Number((await admin`SELECT count(*) AS n FROM event_lookups WHERE viewer_attendee_id = ${ada} AND target_attendee_id IS NULL`)[0].n) >= 1)
check('the full directory is closed unless the organiser chose it', await isRejected(() => asAtt(ada, visitor`SELECT * FROM attendee_directory()`)))
await admin`UPDATE events SET discovery = 'directory' WHERE id = ${eventA.eventId}`
const dir = (await asAtt(ada, visitor`SELECT id FROM attendee_directory()`))[1] as Array<{ id: string }>
check('the full directory lists others, not yourself', dir.some((r) => r.id === ivan) && dir.every((r) => r.id !== ada))
await admin`INSERT INTO event_lookups (event_id, target_attendee_id, viewer_attendee_id, session_token) SELECT ${eventA.eventId}, NULL, ${ada}, 'search-miss' FROM generate_series(1, 60)`
check('badge search is capped per attendee per hour', await isRejected(() => find(ada, 'I-001')))
await admin`DELETE FROM event_lookups WHERE viewer_attendee_id = ${ada}`

// 0007: directory search matches names and card answers, never what a name-only card hides.
await admin`UPDATE event_attendees SET answers = '{"x":"climate fintech"}'::jsonb WHERE id = ${ivan}`
const search = async (q: string) => (await asAtt(ada, visitor`SELECT id FROM attendee_directory(${q}::text)`))[1] as Array<{ id: string }>
check('directory search finds someone by a word on their card', (await search('FINTECH')).some((r) => r.id === ivan))
check('directory search with no match returns nobody', (await search('zz-no-such-word')).length === 0)
await admin`UPDATE event_attendees SET profile_visibility = 'name' WHERE id = ${ivan}`
check('directory search never matches the hidden answers of a name-only card', (await search('fintech')).every((r) => r.id !== ivan))
await admin`UPDATE event_attendees SET profile_visibility = 'full' WHERE id = ${ivan}`
check('directory search with an empty box lists everyone', (await search('')).some((r) => r.id === ivan))

await asAtt(ada, visitor`INSERT INTO saved_attendees (event_id, attendee_id, saved_attendee_id) VALUES (${eventA.eventId}, ${ada}, ${ivan})`)
check('an attendee can save someone, privately', ((await asAtt(ada, visitor`SELECT id FROM saved_attendees`))[1] as unknown[]).length === 1 && ((await asAtt(ivan, visitor`SELECT id FROM saved_attendees`))[1] as unknown[]).length === 0)
check('an attendee cannot save on someone else’s behalf', await isRejected(() => asAtt(ada, visitor`INSERT INTO saved_attendees (event_id, attendee_id, saved_attendee_id) VALUES (${eventA.eventId}, ${ivan}, ${cara.id})`)))
check('organisers cannot read saved people, requests, messages or reports', (await isRejected(() => asA(app`SELECT id FROM saved_attendees`))) && (await isRejected(() => asA(app`SELECT id FROM message_requests`))) && (await isRejected(() => asA(app`SELECT id FROM event_messages`))) && (await isRejected(() => asA(app`SELECT id FROM abuse_reports`))))

const ask = (from: string, to: string, body = 'Hello there') => asAtt(from, visitor`SELECT * FROM message_request_send(${to}::uuid, ${body})`)
check('no message requests when the organiser has not turned messaging on', await isRejected(() => ask(ada, ivan)))
await admin`UPDATE events SET messaging_enabled = true WHERE id = ${eventA.eventId}`
const sent = (await ask(ada, ivan))[1] as Array<{ request_id: string; notify_to: string | null }>
const req = sent[0].request_id
check('a message request is sent, with no email notice unless asked for', !!req && sent[0].notify_to === null)
check('a second request to the same person is refused', await isRejected(() => ask(ada, ivan)))
check('the other person cannot open a second, crossing request', await isRejected(() => ask(ivan, ada)))
check('no replies before the request is accepted', await isRejected(() => asAtt(ada, visitor`SELECT message_send(${req}::uuid, 'pushy')`)))
check('an attendee of another event cannot see the request', ((await asAtt(bea.id, visitor`SELECT id FROM message_requests WHERE id = ${req}`))[1] as unknown[]).length === 0)
check('the sender cannot accept their own request', ((await asAtt(ada, visitor`SELECT message_request_respond(${req}::uuid, 'accept') AS ok`))[1] as Array<{ ok: boolean }>)[0].ok === false)
await admin`UPDATE event_attendees SET allow_messages = false WHERE id = ${cara.id}`
check('nobody can request someone who turned requests off', await isRejected(() => ask(ada, cara.id)))
await admin`UPDATE event_attendees SET allow_messages = true WHERE id = ${cara.id}`
check('the recipient accepts', ((await asAtt(ivan, visitor`SELECT message_request_respond(${req}::uuid, 'accept') AS ok`))[1] as Array<{ ok: boolean }>)[0].ok === true)
await asAtt(ada, visitor`SELECT message_send(${req}::uuid, 'Great to meet you')`)
const thread = (await asAtt(ivan, visitor`SELECT body, read_at FROM event_messages WHERE request_id = ${req} ORDER BY created_at`))[1] as Array<{ read_at: string | null }>
check('both messages reach the recipient, unread', thread.length === 2 && thread.every((m) => m.read_at === null))
await asAtt(ivan, visitor`SELECT messages_mark_read(${req}::uuid)`)
check('reading a conversation marks it read', Number((await admin`SELECT count(*) AS n FROM event_messages WHERE request_id = ${req} AND read_at IS NULL`)[0].n) === 0)
await admin`UPDATE events SET ends_at = now() - interval '1 minute' WHERE id = ${eventA.eventId}`
check('no new message requests after the event ends', await isRejected(() => ask(ada, cara.id)))
check('accepted conversations can still reply after the end', !(await isRejected(() => asAtt(ivan, visitor`SELECT message_send(${req}::uuid, 'Following up')`))))
await admin`UPDATE events SET ends_at = now() - interval '49 hours' WHERE id = ${eventA.eventId}`
check('replies stop 48 hours after the end', await isRejected(() => asAtt(ivan, visitor`SELECT message_send(${req}::uuid, 'Too late')`)))
await admin`UPDATE events SET ends_at = now() - interval '1 minute' WHERE id = ${eventA.eventId}`
await asAtt(ivan, visitor`SELECT attendee_block(${ada}::uuid)`)
check('after a block, the blocked person cannot message', await isRejected(() => asAtt(ada, visitor`SELECT message_send(${req}::uuid, 'Hello?')`)))
check('after a block, neither finds the other in search', (await find(ada, 'I-001')).length === 0 && (await find(ivan, 'F-001')).length === 0)
const canView = async (viewer: string, target: string) => ((await asAtt(viewer, visitor`SELECT attendee_can_view(${target}::uuid) AS ok`))[1] as Array<{ ok: boolean }>)[0].ok
check('after a block, neither can open the other’s card', (await canView(ada, ivan)) === false && (await canView(ivan, ada)) === false)
check('a block does not stop anyone else opening the card', (await canView(cara.id, ivan)) === true && (await visitor`SELECT attendee_can_view(${ivan}::uuid) AS ok`)[0].ok === true)
check('the blocker sees whom they blocked, the blocked person sees nothing', ((await asAtt(ivan, visitor`SELECT id FROM attendee_my_blocks()`))[1] as Array<{ id: string }>).some((r) => r.id === ada) && ((await asAtt(ada, visitor`SELECT id FROM attendee_my_blocks()`))[1] as unknown[]).length === 0)
check('only the blocker can unblock', ((await asAtt(ada, visitor`SELECT attendee_unblock(${ivan}::uuid) AS ok`))[1] as Array<{ ok: boolean }>)[0].ok === false && ((await asAtt(ivan, visitor`SELECT attendee_unblock(${ada}::uuid) AS ok`))[1] as Array<{ ok: boolean }>)[0].ok === true && (await canView(ada, ivan)) === true)
await asAtt(ivan, visitor`SELECT attendee_block(${ada}::uuid)`)
check('an attendee can report someone at their event', ((await asAtt(ada, visitor`SELECT attendee_report(${ivan}::uuid, ${req}::uuid, 'test report') AS ok`))[1] as Array<{ ok: boolean }>)[0].ok === true)
check('nobody can report someone from another event', ((await asAtt(ada, visitor`SELECT attendee_report(${bea.id}::uuid, NULL, 'x') AS ok`))[1] as Array<{ ok: boolean }>)[0].ok === false)
await admin`UPDATE events SET ends_at = now(), discovery = 'badge', messaging_enabled = false WHERE id = ${eventA.eventId}`

// M8 + M9 + M10: plan changes, linking a card to an account, shop interest.
check('an owner cannot change their own plan', await isRejected(() => asA(app`UPDATE users SET plan = 'pro' WHERE id = ${USER_A}`)))
check('an owner can still edit their profile', !(await isRejected(() => asA(app`UPDATE users SET bio = 'verify bio', updated_at = now() WHERE id = ${USER_A}`))))
check('an owner cannot make themselves Pro through the webhook function', await isRejected(() => asA(app`SELECT activate_pro(${USER_A}, 'cus_verify')`)))
await visitor`SELECT activate_pro(${USER_B}, 'cus_verify_b')`
check('a verified Stripe payment makes the account Pro', (await admin`SELECT plan FROM users WHERE id = ${USER_B}`)[0].plan === 'pro')
await visitor`SELECT deactivate_pro('cus_verify_b')`
check('a cancelled subscription returns the account to Free', (await admin`SELECT plan FROM users WHERE id = ${USER_B}`)[0].plan === 'free')
check('an attendee links their card to an account once', ((await asAtt(cara.id, visitor`SELECT attendee_link_account(${USER_B}) AS ok`))[1] as Array<{ ok: boolean }>)[0].ok === true && ((await asAtt(cara.id, visitor`SELECT attendee_link_account(${USER_A}) AS ok`))[1] as Array<{ ok: boolean }>)[0].ok === false)
check('a linked event shows under Attending for that account only', ((await asB(app`SELECT event_id FROM my_attended_events()`))[1] as Array<{ event_id: string }>).some((r) => r.event_id === eventA.eventId) && ((await asA(app`SELECT event_id FROM my_attended_events()`))[1] as unknown[]).length === 0)
// 0007: read-only copies of accepted conversations for the linked account only.
const [keptReq] = await admin`INSERT INTO message_requests (event_id, from_attendee_id, to_attendee_id, status) VALUES (${eventA.eventId}, ${cara.id}, ${ivan}, 'accepted') RETURNING id`
await admin`INSERT INTO event_messages (request_id, from_attendee_id, body) VALUES (${keptReq.id}, ${cara.id}, 'kept hello')`
const keptFor = async (as: typeof asA) => (await as(app`SELECT * FROM my_kept_conversations(${eventA.eventId}::uuid)`))[1] as Array<{ messages: Array<{ body: string; mine: boolean }> }>
const keptB = await keptFor(asB)
check('a linked account keeps a read-only copy of its accepted conversations', keptB.length === 1 && keptB[0].messages[0].body === 'kept hello' && keptB[0].messages[0].mine === true)
check('another account sees none of those conversations', (await keptFor(asA)).length === 0)
check('visitors cannot call the kept-conversations function', await isRejected(() => visitor`SELECT * FROM my_kept_conversations(${eventA.eventId}::uuid)`))
// 0007: an attendee's own personal link, made right after joining.
check('an attendee can add a personal link for themselves only', ((await asAtt(cara.id, visitor`SELECT attendee_add_own_link(${sha('d'.repeat(64))}) AS ok`))[1] as Array<{ ok: boolean }>)[0].ok === true && (await redeem('verify-event-a', 'd'.repeat(64))) === cara.id)
check('a malformed link hash is refused', ((await asAtt(cara.id, visitor`SELECT attendee_add_own_link('nope') AS ok`))[1] as Array<{ ok: boolean }>)[0].ok === false)
check('someone who is not an attendee cannot add a link', await isRejected(() => visitor`SELECT attendee_add_own_link(${sha('e'.repeat(64))})`))
// 0007: nickname links never reveal an Incognito page, and photos follow the live-code rule.
// (The original personal code and campaign of A were deleted above, so these checks make their own.)
const [codeA2] = await admin`INSERT INTO codes (user_id, slug, kind, is_live) VALUES (${USER_A}, 'verify-a2', 'personal', true) RETURNING id`
const [campaignA2] = await admin`INSERT INTO campaigns (user_id, code_id, mode, name, status) VALUES (${USER_A}, ${codeA2.id}, 'networking', 'A2 live', 'live') RETURNING id`
await admin`UPDATE users SET handle = 'verifya' WHERE id = ${USER_A}`
check('a nickname resolves to the owner’s live code', (await visitor`SELECT code_for_handle('VerifyA') AS slug`)[0].slug === 'verify-a2')
await admin`UPDATE campaigns SET mode = 'incognito' WHERE id = ${campaignA2.id}`
check('a nickname does not resolve while the live Mode is Incognito', (await visitor`SELECT code_for_handle('verifya') AS slug`)[0].slug === null)
await admin`UPDATE campaigns SET mode = 'networking' WHERE id = ${campaignA2.id}`
await admin`INSERT INTO user_photos (user_id, bytes) VALUES (${USER_A}, decode('00', 'hex'))`
check('a visitor can load the photo of an owner whose code is live', (await visitor`SELECT user_id FROM user_photos WHERE user_id = ${USER_A}`).length === 1)
check('another owner cannot read or replace my photo', ((await asB(app`SELECT user_id FROM user_photos WHERE user_id = ${USER_A}`))[1] as unknown[]).length === 0 && await isRejected(() => asB(app`INSERT INTO user_photos (user_id, bytes) VALUES (${USER_A}, decode('01', 'hex'))`)))
await admin`UPDATE codes SET is_live = false WHERE id = ${codeA2.id}`
check('the photo is unavailable while sharing is paused', (await visitor`SELECT user_id FROM user_photos WHERE user_id = ${USER_A}`).length === 0)
await admin`UPDATE codes SET is_live = true WHERE id = ${codeA2.id}`
// 0009: event covers, and the plan column that lets a visitor page apply the Free link limit.
await admin`INSERT INTO event_covers (event_id, bytes) VALUES (${eventA.eventId}, decode('00', 'hex'))`
check('a visitor can load the cover of a published event', (await visitor`SELECT event_id FROM event_covers WHERE event_id = ${eventA.eventId}`).length === 1)
check('another organiser cannot read or replace my event cover', ((await asB(app`SELECT event_id FROM event_covers WHERE event_id = ${eventA.eventId}`))[1] as unknown[]).length === 0 && await isRejected(() => asB(app`INSERT INTO event_covers (event_id, bytes) VALUES (${eventA.eventId}, decode('01', 'hex')) ON CONFLICT (event_id) DO UPDATE SET bytes = excluded.bytes`)))
const statusA = (await admin`SELECT status FROM events WHERE id = ${eventA.eventId}`)[0].status as string
await admin`UPDATE events SET status = 'draft' WHERE id = ${eventA.eventId}`
check('a cover is unavailable to visitors while the event is not published', (await visitor`SELECT event_id FROM event_covers WHERE event_id = ${eventA.eventId}`).length === 0)
await admin`UPDATE events SET status = ${statusA} WHERE id = ${eventA.eventId}`
check('a visitor can read the plan of an owner whose code is live, and nothing sensitive beside it', (await visitor`SELECT plan FROM users WHERE id = ${USER_A}`).length === 1 && await isRejected(() => visitor`SELECT email FROM users WHERE id = ${USER_A}`))
// 0007: personal blocks by browser token are readable to the respond check.
await admin`INSERT INTO blocked_devices (user_id, session_token) VALUES (${USER_A}, 'verify-blocked-token')`
check('the respond check can see a browser block', (await visitor`SELECT id FROM blocked_devices WHERE user_id = ${USER_A} AND session_token = 'verify-blocked-token'`).length === 1)
check('a browser token can be blocked only once per owner', await isRejected(() => admin`INSERT INTO blocked_devices (user_id, session_token) VALUES (${USER_A}, 'verify-blocked-token')`))

await asA(app`INSERT INTO shop_interests (user_id, product) VALUES (${USER_A}, 'shirt')`)
check('shop interest is private to its owner', ((await asB(app`SELECT id FROM shop_interests`))[1] as unknown[]).length === 0 && await isRejected(() => asA(app`INSERT INTO shop_interests (user_id, product) VALUES (${USER_B}, 'card')`)))

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

// 0007: joining needs an email, one network can join 30 times an hour, removed people free places.
const register2 = (eventId: string, name: string, letter: string | null, email: string, ip = 'verify-ip', max = 500) => visitor`
  SELECT attendee_id, attendee_tag FROM register_attendee(${eventId}::uuid, ${name}, ${letter}, '{}'::jsonb, ${max}::integer, ${email}, ${ip})`
check('joining without an email is refused', await isRejected(() => register2(eventC.eventId, 'No Mail', 'F', '')))
check('joining with a malformed email is refused', await isRejected(() => register2(eventC.eventId, 'Bad Mail', 'F', 'not-an-email')))
const joined = await register2(eventC.eventId, 'Mail Person', 'F', ' Mail@Example.TEST ')
check('joining stores the email, trimmed and lower-cased', (await admin`SELECT email FROM event_attendees WHERE id = ${joined[0].attendee_id}`)[0].email === 'mail@example.test')
await admin`INSERT INTO join_attempts (event_id, ip_hash) SELECT ${eventC.eventId}, 'verify-busy-ip' FROM generate_series(1, 30)`
check('one network can join at most 30 times an hour per event', await isRejected(() => register2(eventC.eventId, 'Thirty One', 'F', 'x@example.test', 'verify-busy-ip')))
check('another network can still join', !(await isRejected(() => register2(eventC.eventId, 'Other Net', 'F', 'y@example.test', 'verify-calm-ip'))))
const active = (await admin`SELECT count(*)::int AS n FROM event_attendees WHERE event_id = ${eventC.eventId} AND status <> 'withdrawn'`)[0].n
check('a full event refuses the next person', await isRejected(() => register2(eventC.eventId, 'Over Cap', 'F', 'z@example.test', 'verify-ip-2', active)))
await asB(app`UPDATE event_attendees SET status = 'withdrawn' WHERE id = ${joined[0].attendee_id}`)
check('an organiser removing someone frees their place', !(await isRejected(() => register2(eventC.eventId, 'Took The Place', 'F', 'w@example.test', 'verify-ip-2', active))))
check('another organiser cannot remove my attendees', ((await asA(app`UPDATE event_attendees SET status = 'withdrawn' WHERE event_id = ${eventC.eventId} RETURNING id`))[1] as unknown[]).length === 0)

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
check('kept conversations stay readable after the event closes', (await keptFor(asB)).length === 1)

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
