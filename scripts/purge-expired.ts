/**
 * Deletes closed events' data after the retention period (M8, decision D5).
 *
 * Does NOTHING unless RETENTION_DAYS is set: the retention period is the owner's decision,
 * not the code's. Deleting an event cascades to its attendees, tags, saved people, message
 * requests, messages, search log, access links and audit entries. Payment records
 * (event_purchases) cascade too, so confirm the accounting retention rule before enabling.
 *
 *   RETENTION_DAYS=30 node scripts/purge-expired.ts            # dry run: counts only
 *   RETENTION_DAYS=30 node scripts/purge-expired.ts --delete   # actually deletes
 */
import { neon } from '@neondatabase/serverless'

process.loadEnvFile('.env.local')
const days = Number(process.env.RETENTION_DAYS)
if (!Number.isInteger(days) || days < 1) {
  console.log('RETENTION_DAYS is not set (decision D5). Nothing deleted.')
  process.exit(0)
}
const db = neon(process.env.DATABASE_OWNER_URL!)
const due = await db`SELECT id, name, directory_expires_at FROM events WHERE directory_expires_at < now() - make_interval(days => ${days})`
console.log(`${due.length} event(s) closed more than ${days} days ago.`)
if (!process.argv.includes('--delete')) {
  console.log('Dry run. Add --delete to remove them.')
  process.exit(0)
}
const gone = await db`DELETE FROM events WHERE directory_expires_at < now() - make_interval(days => ${days}) RETURNING id`
console.log(`Deleted ${gone.length} event(s) and their attendee data.`)
