/**
 * Asks for the Stripe SANDBOX secret key with hidden typing and saves it into .env.test.local.
 *   npm run test:stripe-key
 * Refuses anything that is not an sk_test_ key. Never prints the key.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import readline from 'node:readline'

const FILE = process.env.SCANME_TEST_ENV_FILE ?? '.env.test.local'
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY })
let muted = false
rl._writeToOutput = (s) => { if (!muted) process.stdout.write(s) }

rl.question('Paste the Stripe SANDBOX secret key (sk_test_...), typing is hidden: ', (answer) => {
  rl.close()
  process.stdout.write('\n')
  const key = answer.trim()
  if (!/^sk_test_[A-Za-z0-9_]+$/.test(key)) { console.error('That is not a test key (sk_test_...). Nothing was saved.'); process.exit(1) }
  const text = readFileSync(FILE, 'utf8')
  if (!/^STRIPE_SECRET_KEY=/m.test(text)) { console.error(`No STRIPE_SECRET_KEY line in ${FILE}. Nothing was saved.`); process.exit(1) }
  writeFileSync(FILE, text.replace(/^STRIPE_SECRET_KEY=[^\r\n]*/m, () => `STRIPE_SECRET_KEY=${key}`))
  console.log(`Saved to ${FILE}. The key was not printed.`)
})
muted = true
