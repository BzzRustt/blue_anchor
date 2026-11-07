import { neon, Pool } from '@neondatabase/serverless'
import { sql } from 'drizzle-orm'
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
const ownerPool = new Pool({ connectionString: connection('APP_DATABASE_URL') })
const ownerDb = drizzleServerless(ownerPool, { schema })
type OwnerTransaction = Parameters<Parameters<typeof ownerDb.transaction>[0]>[0]

export async function withOwnerDb<T>(
  userId: string,
  work: (tx: OwnerTransaction) => Promise<T>
): Promise<T> {
  if (!userId) throw new Error('A verified owner id is required for an owner database transaction.')

  return ownerDb.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' })
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`)
    return work(tx)
  })
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
const attendeePool = new Pool({ connectionString: connection('VISITOR_DATABASE_URL') })
const attendeeDb = drizzleServerless(attendeePool, { schema })
type AttendeeTransaction = Parameters<Parameters<typeof attendeeDb.transaction>[0]>[0]

export async function withAttendeeDb<T>(
  attendeeId: string,
  work: (tx: AttendeeTransaction) => Promise<T>
): Promise<T> {
  if (!attendeeId) {
    throw new Error('A verified attendee id is required for an attendee database transaction.')
  }

  return attendeeDb.transaction(async (tx) => {
    const claims = JSON.stringify({ attendee: attendeeId })
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`)
    return work(tx)
  })
}

export { schema }
