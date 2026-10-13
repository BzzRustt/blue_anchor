/**
 * Proves the schema's guarantees against the real database.
 *
 * Run after any schema change:  npm run db:verify
 *
 * Checks the things that are claims rather than syntax: the one-live-campaign-per-code
 * constraint, the plan history cutoff, cascade behaviour on delete, and whether RLS is
 * actually enforced for the role the application connects as.
 */
import { neon } from '@neondatabase/serverless'
import { historyCutoff } from '../lib/plans.ts'

process.loadEnvFile('.env.local')
const sql = neon(process.env.DATABASE_URL!)

let failures = 0

function check(label: string, passed: boolean, detail = '') {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!passed) failures++
}

const TEST_USER = 'verify-test-user'

async function cleanup() {
  await sql`DELETE FROM users WHERE id = ${TEST_USER}`
}

// ─── structure ────────────────────────────────────────────────────────────────

const tables = await sql`
  SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
         (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '__drizzle_migrations'
  ORDER BY c.relname
`

const authTables = new Set(['session', 'account', 'verification'])
const productTables = tables.filter((table) => !authTables.has(table.relname))
check('15 tables exist (12 product, 3 auth)', tables.length === 15 && productTables.length === 12, `found ${tables.length}`)
check(
  'RLS enabled on every product table',
  productTables.every((t) => t.relrowsecurity),
  productTables.filter((t) => !t.relrowsecurity).map((t) => t.relname).join(', ') || 'all enabled'
)
check(
  'every product table has at least one policy',
  productTables.every((t) => t.policies > 0),
  productTables.filter((t) => t.policies === 0).map((t) => t.relname).join(', ') || 'all covered'
)

const ext = await sql`SELECT installed_version FROM pg_available_extensions WHERE name = 'pg_session_jwt'`
check('pg_session_jwt installed', !!ext[0]?.installed_version, ext[0]?.installed_version ?? 'not installed')

// ─── is RLS actually enforced for the connecting role? ────────────────────────

const role = await sql`SELECT current_user AS role, usesuper AS superuser, usebypassrls AS bypass
                       FROM pg_user WHERE usename = current_user`
const bypasses = role[0]?.bypass || role[0]?.superuser
const forced = productTables.every((t) => t.relforcerowsecurity)

await sql`INSERT INTO users (id, email, name) VALUES (${TEST_USER}, 'verify@example.test', 'Verify User')`
const readWithoutJwt = await sql`SELECT id FROM users WHERE id = ${TEST_USER}`

// A table owner bypasses its own RLS unless FORCE ROW LEVEL SECURITY is set. This is
// expected for a server-side-only app, but it must be stated, not assumed away.
console.log(
  `INFO  connecting role=${role[0]?.role} bypassrls=${bypasses} force_rls=${forced} ` +
    `read_without_jwt=${readWithoutJwt.length} row(s)`
)

// The app must eventually connect as app_user, not the owner. Assert the role exists and
// that it cannot bypass policy, so this cannot silently regress.
const appRole = await sql`SELECT rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'app_user'`
check('least-privilege app_user role exists', appRole.length === 1)
check(
  'app_user cannot bypass RLS',
  appRole.length === 1 && appRole[0].rolbypassrls === false,
  `rolbypassrls=${appRole[0]?.rolbypassrls}`
)

const appGrants = await sql`
  SELECT count(DISTINCT table_name)::int AS n FROM information_schema.role_table_grants
  WHERE grantee = 'app_user' AND privilege_type = 'SELECT'
`
check('app_user is granted read on all 12 tables', appGrants[0].n >= 12, `${appGrants[0].n} tables`)

// Honest status line: RLS is not yet load-bearing while the app connects as the owner.
check(
  'RLS is enforced for the connecting role',
  !bypasses || forced,
  bypasses
    ? 'NOT ENFORCED — app still connects as neondb_owner (BYPASSRLS). Closes in the auth slice; see lib/db/rls.sql'
    : 'enforced'
)

// ─── one live campaign per code ───────────────────────────────────────────────

const [code] = await sql`
  INSERT INTO codes (user_id, slug) VALUES (${TEST_USER}, 'verify-slug') RETURNING id
`
await sql`
  INSERT INTO campaigns (user_id, code_id, mode, name, status)
  VALUES (${TEST_USER}, ${code.id}, 'private', 'First live', 'live')
`

let secondLiveRejected = false
let rejectionDetail = 'second live campaign was ACCEPTED'
try {
  await sql`
    INSERT INTO campaigns (user_id, code_id, mode, name, status)
    VALUES (${TEST_USER}, ${code.id}, 'creator', 'Second live', 'live')
  `
} catch (error) {
  secondLiveRejected = true
  rejectionDetail = (error as Error).message.split('\n')[0]
}
check('a second live campaign on one code is rejected', secondLiveRejected, rejectionDetail)

// Drafts on the same code must still be allowed — the index is partial, not total.
let draftAllowed = true
try {
  await sql`
    INSERT INTO campaigns (user_id, code_id, mode, name, status)
    VALUES (${TEST_USER}, ${code.id}, 'networking', 'A draft', 'draft')
  `
} catch {
  draftAllowed = false
}
check('multiple non-live campaigns on one code are allowed', draftAllowed)

// ─── plan history cutoff ──────────────────────────────────────────────────────

const [liveCampaign] = await sql`
  SELECT id FROM campaigns WHERE user_id = ${TEST_USER} AND status = 'live'
`
await sql`
  INSERT INTO responses (user_id, campaign_id, code_id, session_token, submitted_at)
  VALUES
    (${TEST_USER}, ${liveCampaign.id}, ${code.id}, 'tok-old',   now() - interval '31 days'),
    (${TEST_USER}, ${liveCampaign.id}, ${code.id}, 'tok-fresh', now() - interval '2 days')
`

const cutoff = historyCutoff('free')!
const visibleToFree = await sql`
  SELECT session_token FROM responses
  WHERE user_id = ${TEST_USER} AND submitted_at >= ${cutoff.toISOString()}
`
check(
  'free plan sees only responses inside 30 days',
  visibleToFree.length === 1 && visibleToFree[0].session_token === 'tok-fresh',
  `${visibleToFree.length} visible: ${visibleToFree.map((r) => r.session_token).join(', ')}`
)

const allResponses = await sql`SELECT count(*)::int AS n FROM responses WHERE user_id = ${TEST_USER}`
check('older responses are retained, not deleted', allResponses[0].n === 2, `${allResponses[0].n} stored`)

// ─── delete behaviour ─────────────────────────────────────────────────────────

await sql`DELETE FROM campaigns WHERE id = ${liveCampaign.id}`
const survived = await sql`
  SELECT campaign_id FROM responses WHERE user_id = ${TEST_USER}
`
check(
  'deleting a campaign keeps its responses',
  survived.length === 2 && survived.every((r) => r.campaign_id === null),
  `${survived.length} response(s) survived, campaign_id nulled`
)

await sql`DELETE FROM codes WHERE id = ${code.id}`
const afterCodeDelete = await sql`SELECT count(*)::int AS n FROM responses WHERE user_id = ${TEST_USER}`
check(
  'deleting a code cascades its responses',
  afterCodeDelete[0].n === 0,
  `${afterCodeDelete[0].n} remaining`
)

// ─── done ─────────────────────────────────────────────────────────────────────

await cleanup()
const leftover = await sql`SELECT count(*)::int AS n FROM users WHERE id = ${TEST_USER}`
check('test data cleaned up', leftover[0].n === 0)

console.log(failures === 0 ? '\nAll database checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
