/**
 * Local Stripe sandbox pre-flight. Plain node, no network, no database connection.
 * Reads .env.local itself and NEVER prints a value: only names, OK/FAIL, and a partly masked database host.
 *   node scripts/stripe-sandbox-check.mjs          check
 *   node scripts/stripe-sandbox-check.mjs --init   first append any missing Stripe placeholder lines to .env.local
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs'

const FILE = '.env.local'
const parse = () => {
  const out = {}
  if (!existsSync(FILE)) return out
  for (const line of readFileSync(FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

const PLACEHOLDERS = {
  STRIPE_SECRET_KEY: 'sk_test_REPLACE_ME',
  STRIPE_WEBHOOK_SECRET: 'whsec_REPLACE_ME',
  STRIPE_PRO_PRICE_ID: 'price_REPLACE_ME',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
}

let env = parse()
if (process.argv.includes('--init')) {
  const missing = Object.keys(PLACEHOLDERS).filter((k) => !(k in env))
  if (missing.length) {
    const raw = existsSync(FILE) ? readFileSync(FILE, 'utf8') : ''
    const lead = raw && !raw.endsWith('\n') ? '\n' : ''
    appendFileSync(FILE, lead + missing.map((k) => `${k}=${PLACEHOLDERS[k]}`).join('\n') + '\n')
  }
  console.log(missing.length ? `--init added: ${missing.join(', ')}` : '--init added: nothing (all names already present)')
  env = parse()
}

const filled = (k) => Boolean(env[k]) && !/REPLACE_ME/i.test(env[k])
let failed = false
const rows = []
const row = (name, status, note = '') => {
  rows.push([name, status, note])
  if (status === 'FAIL') failed = true
}

const rule = (name, test, hint) => {
  if (!filled(name)) return row(name, 'FAIL', env[name] ? 'placeholder, not filled in' : 'missing/empty')
  row(name, test(env[name]) ? 'OK' : 'FAIL', test(env[name]) ? 'present' : hint)
}

const key = env.STRIPE_SECRET_KEY ?? ''
if (/^(sk|rk)_live_/.test(key)) {
  console.error('\n*** STOP: STRIPE_SECRET_KEY is a LIVE key. Local testing must use sk_test_ only. Remove it from .env.local now. ***\n')
  failed = true
}
rule('STRIPE_SECRET_KEY', (v) => v.startsWith('sk_test_'), 'must start sk_test_ (test mode only)')
rule('STRIPE_WEBHOOK_SECRET', (v) => v.startsWith('whsec_'), 'must start whsec_ (from `stripe listen`)')
rule('STRIPE_PRO_PRICE_ID', (v) => v.startsWith('price_'), 'must start price_ (a TEST-mode price)')
rule('NEXT_PUBLIC_APP_URL', (v) => v.startsWith('http://localhost'), 'must start http://localhost for the local test')

const mask = (v) => {
  try {
    const h = new URL(v).hostname
    const [first, ...rest] = h.split('.')
    return `${first.slice(0, 6)}***.${rest.join('.')}`
  } catch {
    return '(not a valid URL)'
  }
}
const dbNames = ['DATABASE_OWNER_URL', 'DATABASE_URL', 'APP_DATABASE_URL', 'AUTH_DATABASE_URL', 'VISITOR_DATABASE_URL']
for (const n of dbNames) {
  const ok = filled(n)
  // The runtime URLs fall back to DATABASE_URL (lib/db/index.ts); the owner URL is only for scripts.
  const fallback = n.endsWith('_DATABASE_URL') && n !== 'DATABASE_URL' && filled('DATABASE_URL')
  if (ok) row(n, 'OK', `host ${mask(env[n])}`)
  else if (fallback || n === 'DATABASE_OWNER_URL') row(n, 'n/a', 'not set (optional here)')
  else row(n, 'FAIL', 'missing')
}

const w = Math.max(...rows.map((r) => r[0].length))
for (const [n, s, note] of rows) console.log(`${n.padEnd(w)}  ${s.padEnd(4)}  ${note}`)
console.log('\nREMINDER: compare the masked host(s) above with your PRODUCTION database in Neon.')
console.log('They must NOT match. Use a separate Neon dev branch/database for this test.')
console.log(failed ? '\nRESULT: NOT READY (fix the FAIL lines)' : '\nRESULT: names and prefixes look right (this does not prove the database is a dev one)')
process.exit(failed ? 1 : 0)
