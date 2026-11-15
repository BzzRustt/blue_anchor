/**
 * Applies a hand-written migration file, one statement at a time:  node scripts/apply-migration.mjs <file>
 * Statements are separated by `--> statement-breakpoint` (drizzle's convention). Run `npm run db:rls`
 * afterwards so grants and policies cover anything new. Uses DATABASE_OWNER_URL from .env.local;
 * the value is never printed.
 */
import { readFileSync } from 'node:fs'
import { Client } from '@neondatabase/serverless'

try { process.loadEnvFile('.env.local') } catch { /* reported below */ }
const url = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL
const file = process.argv[2]
if (!url || !file) { console.error('Usage: node scripts/apply-migration.mjs <file>  (and DATABASE_OWNER_URL in .env.local)'); process.exit(1) }

const statements = readFileSync(file, 'utf8').split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean)
const client = new Client(url)
try {
  await client.connect()
  for (const [index, statement] of statements.entries()) {
    await client.query(statement)
    console.log(`ok ${index + 1}/${statements.length}: ${statement.replace(/\s+/g, ' ').slice(0, 70)}`)
  }
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exitCode = 1
} finally {
  await client.end()
}
