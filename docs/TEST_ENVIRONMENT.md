# Isolated test environment

A separate, empty Neon **project** (not a branch of production), test-mode Stripe, and captured email. It never touches production data, live keys, or real inboxes.

## Why it is separate

- `.env.local` holds the real database and real settings. Scripts and `next dev` load it, so a test run must not use it.
- `npm run test:*` runs everything through `scripts/with-test-env.mjs`, which reads **only** `.env.test.local`. Every variable the app reads is set explicitly (empty if the test file omits it), so nothing from `.env.local` can fill a gap. Verified: a value that exists only in a `.env.local` is not visible to the test run.
- The wrapper refuses to start unless:
  - every database URL points at a host listed in `SCANME_TEST_DB_HOSTS`;
  - `STRIPE_SECRET_KEY` starts with `sk_test_` (live keys are refused);
  - `STRIPE_WEBHOOK_SECRET` starts with `whsec_`;
  - the app origin is `http://localhost:<port>`.
- Email: the wrapper forces `EMAIL_MODE=capture` and an empty `RESEND_API_KEY`. Mail is written to `.test-outbox/emails.jsonl` and nothing is sent.
- Values are never printed.

## One-time setup

1. In Neon, create a NEW empty project (`neon projects create --name scanme-test`); do not branch production, because a branch copies live data. Copy its hostname(s) into `SCANME_TEST_DB_HOSTS` and its connection strings into the five `DATABASE_*` / `*_DATABASE_URL` lines of `.env.test.local`. Compare the hostname with production in Neon first; they must differ.
2. `cp .env.test.example .env.test.local` (Windows: copy the file). Fill in the values. Generate `SESSION_SECRET` and `BETTER_AUTH_SECRET` fresh, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. Stripe (test mode only): copy the `sk_test_` key, create a monthly test price (`price_...`), save a Customer Portal configuration in test mode, then run `stripe login` once.
4. `npm run test:check`. It confirms the database hosts, the key prefixes, and (with a test key and price set) that Stripe reports the price as test mode. It moves no money.

## Migrations, seed, run

```
npm run test:migrate      # FRESH empty test database only: schema push, hand-written migrations 0002-0008, RLS, runtime role logins
npm run test:verify       # database checks (scripts/verify-db.ts)
npm run test:seed         # synthetic users, modes, events, attendees, messages, shop interests
npm run test:dev          # the app on http://localhost:3000 against the test branch
npm run test:unseed       # remove every synthetic record (only accounts with demo- ids and @demo.scanme.test)
```

`test:seed` refuses to run if the database is not on the allow-listed host and refuses if demo data already exists (run `test:unseed` first). It writes the shared synthetic password to `.test-accounts.txt` (gitignored); it is not printed.

### Accounts (synthetic, all `@demo.scanme.test`)

| Login | Plan | Role for testing |
|---|---|---|
| `organiser@demo.scanme.test` | Pro (seeded, **not paid**) | Event organiser: live and draft events, attendees, inbox |
| `creator@…`, `portfolio@…` | Pro (seeded) | Creator and Portfolio Modes |
| `basic@…`, `incognito@…`, `attendee@…` | Free | Free Modes, attendee on the event side |
| `organiser2@…` | Free | Owns a draft event that needs payment to publish |
| `newuser@…` | Free, no Mode yet | **Use this one for real Stripe checkout**: it has no seeded entitlement |

Seeded Pro accounts exist to show Pro features. They have no Stripe subscription, so a Stripe test purchase must be made with `newuser@…` (or a fresh signup).

## Stripe test purchase

1. `stripe listen --forward-to localhost:3000/api/stripe/webhook`; paste the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET` in `.env.test.local`, then restart `npm run test:dev`.
2. Sign in as `newuser@…`, go to Profile, press **Upgrade to Pro**, pay with `4242 4242 4242 4242`, any future expiry, any CVC.
3. The success page only says Stripe is confirming. Pro appears when the webhook has been verified and the database updated.

Test cards and cases are listed in the README (decline `4000 0000 0000 0341`, 3-D Secure `4000 0025 0000 3155`).

## Known limits

- Google sign-in is optional: it appears only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in `.env.test.local`. Use a separate test OAuth client, never the production one.
- The wrapper pins the variables listed in `KNOWN` in `scripts/with-test-env.mjs` (all of `.env.example` plus Stripe and Google). A new variable the app reads must be added there, or `.env.local` can supply it to the test run.
- Photo QR download is gated in the interface only; the PNG is generated in the browser (see README "Photo QR Studio").
- Refund rule (decided 2026-11-27): a full refund of an event payment returns an unstarted event to draft; a started event stays published. Partial refunds change nothing. Pro follows the subscription, not refunds.

## Webhook forwarding with the Stripe CLI

The stripe account that owns your `sk_test_` key is the one that must receive webhooks. Run the listener with that key (not just the CLI login), and name the events:

```
$env:STRIPE_API_KEY = "<your sk_test key>"
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted,charge.refunded --forward-to localhost:3000/api/stripe/webhook
```

`stripe listen --print-secret` with the same key gives the matching `whsec_` for `.env.test.local`.
