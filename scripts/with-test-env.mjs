/**
 * Runs one command against the ISOLATED TEST environment (.env.test.local), never .env.local.
 *
 *   node scripts/with-test-env.mjs next dev
 *   node scripts/with-test-env.mjs node scripts/demo-data.ts seed
 *   node scripts/with-test-env.mjs --check        verify the test setup (also asks Stripe if a key is set)
 *
 * How the isolation works: the app and several scripts call process.loadEnvFile('.env.local'), which
 * never overwrites a variable that already exists. So this wrapper sets EVERY variable the app reads
 * (empty when the test file leaves it out). Nothing can then leak in from .env.local.
 *
 * Values are never printed. Checks fail closed: any doubt stops the command.
 */
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const FILE = process.env.SCANME_TEST_ENV_FILE ?? '.env.test.local'
const args = process.argv.slice(2)
// --bootstrap: only the owner URL is needed (before the runtime roles exist).
const bootstrap = args[0] === '--bootstrap'
if (bootstrap) args.shift()
const checkOnly = args[0] === '--check'

const maskHost = (h) => `${h.slice(0, 6)}…${h.slice(h.lastIndexOf('.') - 2)}`
const fail = (message) => {
  console.error(`\n[test-env] STOPPED: ${message}\n`)
  process.exit(1)
}

if (!args.length) fail('no command given. Example: node scripts/with-test-env.mjs next dev')
if (!existsSync(FILE)) fail(`${FILE} is missing. Copy .env.test.example to ${FILE} and fill in the test values (see docs/TEST_ENVIRONMENT.md).`)

// Every name the app or its scripts read. Also includes any name listed in .env.example.
const KNOWN = new Set([
  'DATABASE_OWNER_URL', 'DATABASE_URL', 'APP_DATABASE_URL', 'AUTH_DATABASE_URL', 'VISITOR_DATABASE_URL',
  'SESSION_SECRET', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'NEXT_PUBLIC_APP_URL',
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL',
  'RESEND_API_KEY', 'EMAIL_FROM', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRO_PRICE_ID',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
])
if (existsSync('.env.example')) {
  for (const line of readFileSync('.env.example', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=/)
    if (m) KNOWN.add(m[1])
  }
}

const values = {}
for (const line of readFileSync(FILE, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/)
  if (m) values[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
}

// Forced values: the test setup can never send real email, and never talks to the public origin.
const forced = { RESEND_API_KEY: '', EMAIL_MODE: 'capture' }
const env = { ...process.env }
for (const name of KNOWN) env[name] = forced[name] ?? values[name] ?? ''
env.EMAIL_MODE = 'capture'
// Optional: SCANME_TEST_PORT=3100 runs the test app on another port when 3000 is taken.
if (process.env.SCANME_TEST_PORT && /^\d{4,5}$/.test(process.env.SCANME_TEST_PORT)) {
  for (const name of ['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL']) if (env[name]) env[name] = env[name].replace(/:\d+$/, `:${process.env.SCANME_TEST_PORT}`)
}
env.RESEND_API_KEY = ''
env.SCANME_ENV = 'test'

// ── Guards ─────────────────────────────────────────────────────────────────────
const allowedHosts = (values.SCANME_TEST_DB_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
if (!allowedHosts.length) fail('SCANME_TEST_DB_HOSTS is empty. List the hostname(s) of your Neon TEST branch there (never production).')

const DB_NAMES = ['DATABASE_OWNER_URL', 'DATABASE_URL', 'APP_DATABASE_URL', 'AUTH_DATABASE_URL', 'VISITOR_DATABASE_URL']
for (const name of DB_NAMES) {
  if (!values[name] && bootstrap && name !== 'DATABASE_OWNER_URL') continue
  if (!values[name]) fail(`${name} is empty in ${FILE}.`)
  let host
  try { host = new URL(values[name]).hostname.toLowerCase() } catch { fail(`${name} is not a valid URL.`) }
  if (!allowedHosts.includes(host)) fail(`${name} points at host "${maskHost(host)}", which is not in SCANME_TEST_DB_HOSTS. Refusing to run.`)
}

const stripeKey = values.STRIPE_SECRET_KEY ?? ''
if (stripeKey && !stripeKey.startsWith('sk_test_')) fail('STRIPE_SECRET_KEY must be a test key (sk_test_...). Live or other keys are refused.')
const webhook = values.STRIPE_WEBHOOK_SECRET ?? ''
if (webhook && !webhook.startsWith('whsec_')) fail('STRIPE_WEBHOOK_SECRET must start with whsec_.')
for (const name of ['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL']) {
  const v = values[name] ?? ''
  if (v && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v)) fail(`${name} must be http://localhost:<port> in the test setup (got a different origin).`)
}
if (!values.SESSION_SECRET || !values.BETTER_AUTH_SECRET) fail('SESSION_SECRET and BETTER_AUTH_SECRET must be set in the test file (use fresh random values, not the production ones).')

console.log(`[test-env] ok: ${FILE}; ${DB_NAMES.length} database URLs on host(s) ${allowedHosts.map(maskHost).join(', ')}; email captured locally; Stripe ${stripeKey ? 'test key' : 'not set'}`)

// ── --check: ask Stripe whether the price is a test-mode object (needs the test key, no money moves) ──
if (checkOnly) {
  if (stripeKey && values.STRIPE_PRO_PRICE_ID) {
    const res = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(values.STRIPE_PRO_PRICE_ID)}`, {
      headers: { authorization: `Bearer ${stripeKey}` },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null)
    if (!res || !res.ok) fail(`Stripe did not return the price (status ${res?.status ?? 'network error'}). Check STRIPE_PRO_PRICE_ID belongs to the same test account as the key.`)
    const price = await res.json()
    if (price.livemode !== false) fail('The Stripe price is live-mode. Use a test-mode price.')
    console.log('[test-env] ok: Stripe confirms the Pro price is test mode.')
  } else {
    console.log('[test-env] Stripe not checked: STRIPE_SECRET_KEY or STRIPE_PRO_PRICE_ID is still empty.')
  }
  process.exit(0)
}

// Re-quote arguments the shell would otherwise split (e.g. node -e "console.log(1)").
const quote = (a) => (/^[\w@%+=:,./\\-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`)
const result = spawnSync(args.map(quote).join(' '), { stdio: 'inherit', env, shell: true })
process.exit(result.status ?? 1)
