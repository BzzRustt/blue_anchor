import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.')
}

/**
 * Owner-scoped database handle.
 *
 * The current configured connection may still use Neon's owner role and carries no user
 * identity, so RLS has nothing to match against. Every owner-facing query must therefore be scoped in SQL by
 * a `userId` derived from the session — never from a request body or query string.
 *
 * Security boundary: the session identity is not yet threaded through to Postgres, so RLS
 * (lib/db/rls.sql) is a second line of defence rather than the primary one. The upgrade
 * path is Neon RLS via pg_session_jwt, which makes auth.user_id() authoritative and lets
 * the policies stand alone — wire it in the auth slice, before any third party can read.
 */
export const db = drizzle(neon(process.env.DATABASE_URL), { schema })

export { schema }
