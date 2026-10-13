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

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS
- Better Auth with the Drizzle adapter
- Neon Postgres through Drizzle ORM
- Zod for request validation
- Phosphor icons and `qrcode` for downloadable codes

## Local setup

1. Copy `.env.example` to `.env.local` and add the Neon connection string and secrets.
2. Install dependencies with `npm install`.
3. Apply the schema with `npm run db:push`. This command also restores the custom RLS policies after Drizzle syncs the tables.
4. Run `npm run db:verify` to check constraints and database security status.
5. Start with `npm run dev`, then open `http://localhost:3000`.

## Verification

```bash
npm test
npm run lint
npm run build
npm run db:verify
```

`db:verify` intentionally fails its final enforcement check while `DATABASE_URL` uses the Neon owner role, which has `BYPASSRLS`. The application currently derives the owner ID from the signed session and scopes every owner query in SQL. Before exposing direct database access to any client, issue a login credential for `app_user`, thread a verified identity into Postgres, and make the existing policies load-bearing.

## Prototype boundaries

- The Shop is a polished product preview and launch-list flow; payment and fulfilment are not connected.
- Profile photos currently use a hosted image URL. The environment template reserves R2 fields for direct uploads.
- Plan comparison and server-side plan gates exist, but billing is not connected.

The product rules and data model are documented in `docs/PRODUCT_SPEC.md`.
