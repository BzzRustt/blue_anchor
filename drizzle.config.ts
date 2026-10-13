import type { Config } from 'drizzle-kit'

// drizzle-kit does not read .env.local. Node's own loader does, with no extra dependency.
try {
  process.loadEnvFile('.env.local')
} catch {
  // Absent during `db:generate`, which only diffs the schema and needs no connection.
}

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
} satisfies Config
