/**
 * Creates independent login credentials for ScanMe's least-privilege runtime roles.
 *
 * Prerequisite: run `npm run db:rls` once so the NOLOGIN roles exist. This script
 * rotates their passwords, enables LOGIN, and stores URLs only in ignored .env.local.
 * It never prints a password or connection string.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from '@neondatabase/serverless'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Reported below.
}

const ownerUrl = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL
if (!ownerUrl) {
  console.error('DATABASE_OWNER_URL is not set in .env.local.')
  process.exit(1)
}

const roles = [
  { env: 'APP_DATABASE_URL', role: 'app_user' },
  { env: 'AUTH_DATABASE_URL', role: 'auth_user' },
  { env: 'VISITOR_DATABASE_URL', role: 'visitor_user' },
]

function credential({ env, role }) {
  const current = process.env[env]
  if (current) {
    const parsed = new URL(current)
    if (decodeURIComponent(parsed.username) !== role) {
      throw new Error(`${env} must use the ${role} database role.`)
    }
    return { env, role, password: decodeURIComponent(parsed.password), url: current }
  }

  const password = randomBytes(32).toString('base64url')
  const parsed = new URL(ownerUrl)
  parsed.username = role
  parsed.password = password
  return { env, role, password, url: parsed.toString() }
}

const credentials = roles.map(credential)
const client = new Client(ownerUrl)

try {
  await client.connect()
  await client.query('BEGIN')
  for (const item of credentials) {
    await client.query("SELECT set_config('scanme.provision_password', $1, true)", [item.password])
    await client.query(`DO $$ BEGIN EXECUTE format('ALTER ROLE ${item.role} LOGIN PASSWORD %L', current_setting('scanme.provision_password')); END $$`)
  }
  await client.query('COMMIT')
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined)
  console.error(`Could not provision runtime roles: ${error.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}

if (!process.exitCode) {
  const envPath = resolve('.env.local')
  let contents = readFileSync(envPath, 'utf8')

  function setEnv(name, value) {
    const line = `${name}=${value}`
    const pattern = new RegExp(`^${name}=.*$`, 'm')
    contents = pattern.test(contents)
      ? contents.replace(pattern, line)
      : `${contents.trimEnd()}\n${line}\n`
  }

  setEnv('DATABASE_OWNER_URL', ownerUrl)
  for (const item of credentials) setEnv(item.env, item.url)
  setEnv('DATABASE_URL', credentials.find((item) => item.env === 'APP_DATABASE_URL').url)
  writeFileSync(envPath, contents)
  console.log('Provisioned app_user, auth_user and visitor_user. Updated .env.local without printing credentials.')
}
