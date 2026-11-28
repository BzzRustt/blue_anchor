/**
 * Builds a FRESH, empty test database from scratch (run once per new Neon test project):
 *   npm run test:migrate
 * 1. drizzle-kit push: tables from lib/db/schema.ts
 * 2. hand-written migrations 0002..0009 (tables and columns that are not in schema.ts)
 * 3. lib/db/rls.sql: row-level security, grants, SQL functions
 * 4. login passwords for the runtime roles, written to .env.test.local (never printed)
 * Every step runs through with-test-env.mjs, so it can only touch the allow-listed test host.
 * Not meant to be re-run on a populated database; create a new empty Neon project to reset.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

const run = (...args) => {
  const r = spawnSync('node', ['scripts/with-test-env.mjs', '--bootstrap', ...args], { stdio: 'inherit', shell: true })
  if (r.status) process.exit(r.status)
}

run('drizzle-kit', 'push', '--force')
for (const f of readdirSync('lib/db/migrations').filter((n) => /^000[2-9]_.*\.sql$/.test(n)).sort()) {
  run('node', 'scripts/apply-migration.mjs', `lib/db/migrations/${f}`)
}
run('node', 'scripts/apply-rls.mjs')
run('node', 'scripts/provision-runtime-roles.mjs')
