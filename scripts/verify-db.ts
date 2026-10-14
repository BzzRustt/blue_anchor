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

check('15 application tables exist', tables.length === 15, `found ${tables.length}`)
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

await cleanup()
const leftover = await admin`SELECT count(*)::int AS n FROM users WHERE id IN (${USER_A}, ${USER_B})`
check('verification data is cleaned up', leftover[0].n === 0)

console.log(failures === 0 ? '\nAll database checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
