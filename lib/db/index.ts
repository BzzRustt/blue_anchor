import { neon, Pool, type PoolClient } from '@neondatabase/serverless'
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http'
import { drizzle as drizzleServerless } from 'drizzle-orm/neon-serverless'
import * as schema from './schema'

function connection(name: 'AUTH_DATABASE_URL' | 'APP_DATABASE_URL' | 'VISITOR_DATABASE_URL') {
  const value = process.env[name] ?? process.env.DATABASE_URL
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`)
  }
  return value
}

/** Better Auth can reach only its four persistence tables in production. */
export const authDb = drizzleHttp(neon(connection('AUTH_DATABASE_URL')), { schema })

/** Anonymous visitors can read the public scan experience and submit scans/responses. */
export const visitorDb = drizzleHttp(neon(connection('VISITOR_DATABASE_URL')), { schema })

/**
 * Owner queries run as a NOBYPASSRLS role. The signed Better Auth session is verified
 * before this helper is called; its user id is installed as transaction-local claims so
 * auth.user_id() is authoritative for every statement in the callback.
 */
const ownerPool = new Pool({ connectionString: connection('APP_DATABASE_URL'), idleTimeoutMillis: 60_000 })
const ownerDb = drizzleServerless(ownerPool, { schema })
type OwnerTransaction = Parameters<Parameters<typeof ownerDb.transaction>[0]>[0]

/** A SQL string literal. Only ever used for the claims JSON we build ourselves (standard_conforming_strings is on). */
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`

/**
 * Runs `work` in one transaction on one pooled connection with the claims installed. BEGIN and the
 * claims go in a single round trip (a simple-protocol multi-statement query), which matters because
 * every round trip to the database is the main cost of a page load.
 */
async function claimedTransaction<D, T>(pool: Pool, claims: object, wrap: (client: PoolClient) => D, work: (tx: D) => Promise<T>): Promise<T> {
  const client: PoolClient = await pool.connect()
  try {
    await client.query(`begin; select set_config('request.jwt.claims', ${literal(JSON.stringify(claims))}, true)`)
    const result = await work(wrap(client))
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function withOwnerDb<T>(
  userId: string,
  work: (tx: OwnerTransaction) => Promise<T>
): Promise<T> {
  if (!userId) throw new Error('A verified owner id is required for an owner database transaction.')
  return claimedTransaction(ownerPool, { sub: userId, role: 'authenticated' }, (client) => drizzleServerless(client, { schema }) as unknown as OwnerTransaction, work)
}

/**
 * An attendee acting on their own event record — editing their card, sending a connect
 * request, reacting to someone else's card.
 *
 * Runs as the anonymous visitor role, so it can never reach owner data. The attendee id
 * must already have been proven from their signed edit token; it is installed as a
 * transaction-local claim that `public.current_attendee_id()` reads, and the policies in
 * lib/db/rls.sql compare it per row. That is what stops an application bug from letting
 * one attendee overwrite another's profile.
 *
 * Directory *reads* do not need this — they are governed by the event's visibility
 * window and should use `visitorDb` directly.
 */
const attendeePool = new Pool({ connectionString: connection('VISITOR_DATABASE_URL'), idleTimeoutMillis: 60_000 })
const attendeeDb = drizzleServerless(attendeePool, { schema })
type AttendeeTransaction = Parameters<Parameters<typeof attendeeDb.transaction>[0]>[0]

export async function withAttendeeDb<T>(
  attendeeId: string,
  work: (tx: AttendeeTransaction) => Promise<T>
): Promise<T> {
  if (!attendeeId) {
    throw new Error('A verified attendee id is required for an attendee database transaction.')
  }
  return claimedTransaction(attendeePool, { attendee: attendeeId }, (client) => drizzleServerless(client, { schema }) as unknown as AttendeeTransaction, work)
}

export { schema }
