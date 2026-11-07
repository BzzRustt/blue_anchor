import { betterAuth } from 'better-auth/minimal'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { authDb, schema } from '@/lib/db'
import { resetPasswordEmail, sendEmail } from '@/lib/email'

const secret = process.env.BETTER_AUTH_SECRET ?? process.env.SESSION_SECRET

if (!secret || secret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET or SESSION_SECRET must be at least 32 characters.')
}

export const auth = betterAuth({
  appName: 'ScanMe',
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  secret,
  database: drizzleAdapter(authDb, {
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
    resetPasswordTokenExpiresIn: 3600,
    /**
     * Failures are swallowed on purpose.
     *
     * /request-password-reset answers "if this email exists, check your inbox" for both a
     * real and an unknown address, which is what keeps it from confirming who has an
     * account. If a transport error escaped here the endpoint would return 200 for an
     * unknown address and 500 for a real one, turning the send into an account-existence
     * oracle. So this logs and returns; the caller is told the same thing either way.
     */
    sendResetPassword: async ({ user, url }) => {
      try {
        const result = await sendEmail({ to: user.email, ...resetPasswordEmail(user.name, url) })
        if (result !== 'sent') {
          console.warn(`[auth] password reset email for user ${user.id} was ${result}`)
        }
      } catch (error) {
        console.error(`[auth] password reset email failed for user ${user.id}:`, error)
      }
    },
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
