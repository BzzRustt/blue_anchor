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

Pro and event payments are re-checked against Stripe before acting (the webhook asks Stripe for the subscription's current status), so late or out-of-order events cannot wrongly switch Pro on or off. If that Stripe lookup fails the webhook answers 503 and Stripe retries.

Event-publish race fix: `lib/db/rls.sql` adds a 2-argument `confirm_event_purchase(text, text)`. The webhook uses it when present and falls back to the 1-argument version if it is not applied yet. Apply with `npm run db:rls` (your own owner database URL). Rollback: `DROP FUNCTION public.confirm_event_purchase(text, text);` (the original stays).

Set the webhook endpoint's API version in the Stripe dashboard to match `STRIPE_API_VERSION` (or confirm the event shapes still fit); the webhook logs a warning line if an event arrives with a different version. `checkout.session.async_payment_failed` deliberately leaves the event awaiting payment, so the organiser can retry.

Sandbox test steps (no real money; names of env vars only, values are yours): switch Stripe to a Sandbox/Test mode, create a test product and monthly price, set `STRIPE_SECRET_KEY` (test key), `STRIPE_PRO_PRICE_ID` and `STRIPE_WEBHOOK_SECRET` in `.env.local`, run `stripe listen --forward-to localhost:3000/api/stripe/webhook` and `npm run dev`. Check the local app is not pointed at your real database first; use a throwaway demo account. Cases: Pro upgrade with 4242 4242 4242 4242 (plan becomes Pro); cancel in the billing portal (back to Free); a declined renewal with 4000 0000 0000 0341 (use a Stripe test clock; Pro kept while retrying); 3-D Secure with 4000 0025 0000 3155; an event purchase with 4242 (event published); `stripe trigger checkout.session.async_payment_succeeded` and `stripe trigger invoice.payment_failed` should answer 200. Stripe dashboard labels may have changed; see Stripe's docs.

### Local sandbox test checklist

1. Make a separate Neon dev branch/database and put ITS URLs in `.env.local` (all five `DATABASE_*` names). Never test against the production database.
2. `npm run stripe:check` (add `-- --init` to append any missing Stripe placeholder lines). It never prints values; it shows a masked database host to compare with production in Neon, and refuses a live key.
3. In Stripe test mode: copy the `sk_test_` key, create a monthly test price (`price_...`), and save a Customer Portal configuration (Settings > Billing > Customer portal, while in test mode). Without it the Manage billing button fails and the app shows the generic payments error.
4. Fill the placeholders yourself, keep `NEXT_PUBLIC_APP_URL=http://localhost:3000` (it builds the success and cancel links), then `stripe login`, `stripe listen --forward-to localhost:3000/api/stripe/webhook` (paste its `whsec_...`), and `npm run dev`.
5. Sign up a throwaway account and run the cases above. Confirm Pro on `/app/profile` (the plan label shows Pro or Free).

## Verification

```bash
npm test
npm run lint
npm run build
npm run db:verify
```

Production uses three `NOBYPASSRLS` database roles. `auth_user` can access only Better Auth persistence, `app_user` receives a verified owner identity inside each transaction, and `visitor_user` can read only live public profile columns and submit scans/responses. `DATABASE_OWNER_URL` is reserved for migrations and verification and must not be added to the deployed web runtime.

## QR Studio (Personalise QR)

`/app/code`, reached from Show QR on Home. A user can turn a picture into their personal QR, in the browser only: the photo is never uploaded or stored, and design settings are saved only in that browser (localStorage). The server supplies the encoded link (the same `/t/<slug>` URL as `/app/qr.png`, which stays as the plain fallback); nothing in the page can change the destination.

- Code: pure TypeScript in `lib/qr-studio/` (tests: `lib/qr-studio/qr-studio.test.ts`), UI in `components/qr-studio/`. Each QR module is drawn as 3x3 squares; the centre cross keeps the real module value, the rest carry a dithered picture. Photo QR defaults to code version 7 (the Phase 1 proof of concept in `poc/qr-studio/` showed version 3 failing a tilt test), selectable under Advanced.
- The page runs software tests (small, blurry, tilted, low contrast, JPEG) with two decoders (jsQR, zxing-wasm, loaded only on this page) and only enables PNG download when the current design read as the exact link in every tested condition. Any edit invalidates the previous result.
- Limits, honestly: a passing software test does not prove a real phone will scan a screen, print, sticker or T-shirt. Test images in the automated tests are synthetic shapes, not photos. Real-phone and print testing, and real portraits, are still to be done. Fine detail is limited (about 3 picture pixels per code square), and the work runs on the main thread, not a Web Worker. Classic and Photo styles only; no saved cloud designs, plans or merchandise yet.
- Plans: downloading a Photo QR is a Pro feature (`canUsePhotoQr` in `lib/plans.ts`); validation, the preview and the Classic QR are free. This is a screen-level gate only: the picture is processed on the device, so it is not tamper-proof.
- `public/qr-studio/zxing_reader.wasm` is a copy from `node_modules/zxing-wasm/dist/reader/` (3.1.7); re-copy it if that package is upgraded.

## Prototype boundaries

- The Shop is a polished product preview and launch-list flow; payment and fulfilment are not connected.
- Profile photos currently use a hosted image URL. The environment template reserves R2 fields for direct uploads.
- Plan comparison and server-side plan gates exist, but billing is not connected.

The product rules and data model are documented in `docs/PRODUCT_SPEC.md`. `PROJECT_CONTEXT.md` describes the earlier Supabase proof of concept and is out of date.

## Isolated test environment

A separate Neon test branch, test-mode Stripe and captured email. Run everything through the `test:*` scripts (they never read `.env.local`). Setup, accounts, seeding and the Stripe test purchase are in [docs/TEST_ENVIRONMENT.md](docs/TEST_ENVIRONMENT.md).
