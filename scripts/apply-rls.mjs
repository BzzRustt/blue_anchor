/**
 * Applies lib/db/rls.sql. Run after every migration:  npm run db:rls
 *
 * Sends the file as a single query. Postgres' simple query protocol handles multiple
 * statements and wraps them in one implicit transaction, so a failure applies nothing.
 * An earlier version split on semicolons, which corrupts dollar-quoted bodies
 * (DO $$ ... $$) — do not reintroduce that.
 */
import { readFileSync } from 'node:fs'
import { Client } from '@neondatabase/serverless'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Reported by the check below.
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Fill in .env.local first.')
  process.exit(1)
}

const sqlText = readFileSync(new URL('../lib/db/rls.sql', import.meta.url), 'utf8')
const client = new Client(process.env.DATABASE_URL)

try {
  await client.connect()
  await client.query(sqlText)
  console.log('Applied lib/db/rls.sql.')
} catch (error) {
  console.error(`Failed to apply rls.sql: ${error.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
