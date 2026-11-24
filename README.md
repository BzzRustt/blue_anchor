# ScanMe

ScanMe is a multi-owner QR networking product. An owner creates a permanent code, puts it on a shirt, card, sticker, or screen, and changes the profile and campaign behind that code without reprinting it. Visitors can understand who the owner is, answer focused questions, and leave a private message without creating an account.

## Working product areas

- Marketing site with Home, How it works, Plans, login, and sign-up pages
- Email and password owner accounts powered by Better Auth
- Responsive owner workspace: Inbox, Campaigns, Insights, My code, Shop, and Profile
- Permanent QR generation and code kill switch
- Campaign drafts with networking, private, creator, and portfolio intents
- Public `/t/[code]` visitor experience with profile context and social links
- Scan analytics, response validation, repeat policies, device blocking checks, and submission rate limiting
- Neon Postgres schema with owner-scoped queries, constraints, and RLS policies
- Password reset by email (Resend over `fetch`; needs `RESEND_API_KEY` and `EMAIL_FROM`)
- Events: organisers create an event, issue numbered tags (optional role letters), import a roster, print badges or export CSV; attendees join at `/e/[slug]` without an account and complete a card that expires 48 hours after the event

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS
- Better Auth with the Drizzle adapter
- Neon Postgres through Drizzle ORM
- Zod for request validation
- Phosphor icons and `qrcode` for downloadable codes

## Local setup

1. Copy `.env.example` to `.env.local`, place Neon's pooled owner connection in `DATABASE_OWNER_URL`, and add the application secrets.
2. Install dependencies with `npm install`.
3. Apply the schema with `npm run db:push`. This also restores the custom RLS policies after Drizzle syncs the tables.
4. Run `npm run db:provision-runtime` once. It creates independent passwords for the restricted `app_user`, `auth_user`, and `visitor_user` roles and writes their URLs only to the ignored `.env.local` file.
5. Run `npm run db:verify` to check constraints, grants, and cross-owner isolation.
6. Start with `npm run dev`, then open `http://localhost:3000`.

## Stripe

Env var names (values live only in your host and `.env.local`, never in git): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`.

Webhook endpoint `/api/stripe/webhook`. In the Stripe dashboard subscribe it to: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.

Also switch on Stripe's customer emails in the dashboard (successful payments, refunds, and the subscription emails under Billing) so Pro subscribers get receipts. One-off event payments already request a Stripe invoice. Tax/VAT is not configured in code; decide that with your accountant first.

Local testing: use test-mode keys only (`sk_test_...`), run `stripe listen --forward-to localhost:3000/api/stripe/webhook`, and put the `whsec_...` it prints in `STRIPE_WEBHOOK_SECRET`. Pay with Stripe's test card 4242 4242 4242 4242. Never use live keys locally.

The API version is pinned in `lib/stripe.ts` (`STRIPE_API_VERSION`).

## Verification

```bash
npm test
npm run lint
npm run build
npm run db:verify
```

Production uses three `NOBYPASSRLS` database roles. `auth_user` can access only Better Auth persistence, `app_user` receives a verified owner identity inside each transaction, and `visitor_user` can read only live public profile columns and submit scans/responses. `DATABASE_OWNER_URL` is reserved for migrations and verification and must not be added to the deployed web runtime.

## Prototype boundaries

- The Shop is a polished product preview and launch-list flow; payment and fulfilment are not connected.
- Profile photos currently use a hosted image URL. The environment template reserves R2 fields for direct uploads.
- Plan comparison and server-side plan gates exist, but billing is not connected.

The product rules and data model are documented in `docs/PRODUCT_SPEC.md`. `PROJECT_CONTEXT.md` describes the earlier Supabase proof of concept and is out of date.
