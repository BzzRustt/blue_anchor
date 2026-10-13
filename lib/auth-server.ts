import { betterAuth } from 'better-auth/minimal'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db, schema } from '@/lib/db'

const secret = process.env.BETTER_AUTH_SECRET ?? process.env.SESSION_SECRET

if (!secret || secret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET or SESSION_SECRET must be at least 32 characters.')
}

export const auth = betterAuth({
  appName: 'ScanMe',
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  secret,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      ...schema,
      user: schema.users,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  user: {
    modelName: 'users',
    additionalFields: {
      plan: { type: 'string', required: false, input: false },
      handle: { type: 'string', required: false },
      bio: { type: 'string', required: false },
      role: { type: 'string', required: false },
      company: { type: 'string', required: false },
      instagram: { type: 'string', required: false },
      linkedin: { type: 'string', required: false },
      website: { type: 'string', required: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    database: {
      joins: false,
    },
  },
  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'],
})

export type OwnerSession = typeof auth.$Infer.Session
