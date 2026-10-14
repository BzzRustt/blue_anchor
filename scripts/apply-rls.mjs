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

const ownerUrl = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL

if (!ownerUrl) {
  console.error('DATABASE_OWNER_URL is not set. Fill in .env.local first.')
  process.exit(1)
}

const sqlText = readFileSync(new URL('../lib/db/rls.sql', import.meta.url), 'utf8')
const client = new Client(ownerUrl)

try {
  await client.connect()
  await client.query(sqlText)
  console.log('Applied lib/db/rls.sql.')
} catch (error) {
  console.error('Failed to apply rls.sql:', {
    name: error.name,
    message: error.message,
    code: error.code,
    detail: error.detail,
    hint: error.hint,
    position: error.position,
    cause: error.cause?.message,
    properties: Object.fromEntries(
      Object.getOwnPropertyNames(error)
        .filter((key) => !['stack', 'query', 'parameters'].includes(key))
        .map((key) => [key, error[key]])
    ),
  })
  process.exitCode = 1
} finally {
  await client.end()
}
