# ScanMe — Project Context

This document is a handoff reference for continuing work in a fresh session. It records every significant decision made so far, the current state of the codebase, and the known issues and gaps that remain.

---

## What the project is

ScanMe is a personal QR-code web app. The owner wears a QR code on their shirt. When a stranger scans it, they land on a warm, mobile-first public page that shows the owner's photo, bio, a poll question, and a freetext note box. The stranger fills it in and submits — the owner sees the results privately in an admin dashboard.

Two audiences, two surfaces:
- **Public page** (`/`) — seen by strangers. Warm, personal, fast. Mobile-first.
- **Admin dashboard** (`/$ADMIN_ROUTE_NAME`) — seen only by the owner. Clean, data-focused. Password-protected.

---

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14, App Router | No Pages Router. No `src/` directory. |
| Language | TypeScript (strict) | |
| Styling | Tailwind CSS v3 | Extended with custom colors `accent` and `paper` |
| Database | Supabase (Postgres) | |
| Supabase client | `@supabase/supabase-js` v2.105.1 + `@supabase/ssr` | |
| Validation | Zod v4 | Required on every API route — no exceptions |
| Session tokens | `uuid` v4 (UUID v4) | |
| Font | DM Sans (Google Fonts via `next/font/google`) | Applied globally in `app/layout.tsx` |

Custom Tailwind colors (in `tailwind.config.ts`):
- `accent` → `#1D9E75` (teal/green — used for progress bar, buttons, chart line)
- `paper` → `#f9f6f1` (warm off-white — used as scanner page background)

---

## Environment variables

All in `.env.local` (gitignored). Safe-to-commit template is `.env.example`.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (safe for browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — bypasses RLS, server-only |
| `ADMIN_PASSWORD` | Password for the admin dashboard |
| `ADMIN_ROUTE_NAME` | URL slug for the admin route — **never hardcoded anywhere in source** |
| `NEXT_PUBLIC_APP_URL` | Full public URL (e.g. `https://scanme.example.com`) |

---

## Database schema

Three tables. All use UUIDs as primary keys with `gen_random_uuid()` defaults. All timestamps are `timestamptz` with `now()` defaults.

```sql
-- One row only — the owner's profile
create table profiles (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  photo_url     text,
  bio           text,
  poll_type     text check (poll_type in ('slider', 'multiple_choice', 'open_text')),
  poll_question text,
  poll_options  text[],        -- used when poll_type = 'multiple_choice'
  note_intro    text,          -- explanatory text shown above the comment box
  instagram     text,          -- handle (with or without @)
  survey_link   text,          -- URL shown after submission
  created_at    timestamptz default now()
);

-- One row per page visit (QR code scan)
create table scans (
  id            uuid primary key default gen_random_uuid(),
  scanned_at    timestamptz default now(),
  session_token text not null,
  ip_hash       text           -- SHA-256 of visitor IP — raw IP is never stored
);

-- One row per form submission
create table responses (
  id             uuid primary key default gen_random_uuid(),
  session_token  text not null, -- joins back to scans
  poll_answer    text,
  comment        text,
  commenter_name text,
  device_hash    text,          -- SHA-256 of visitor IP at submission time
  submitted_at   timestamptz default now()
);
```

**Important note:** The `poll_type` check constraint in this schema differs from what was written in `README.md` during scaffolding (which incorrectly listed `'multiple_choice'` and `'text'`). The correct values, matching `types/database.ts`, are `'slider'`, `'multiple_choice'`, and `'open_text'`. Use the SQL above when creating tables.

---

## File structure (current)

```
/
├── .env.example                     # Safe-to-commit env template
├── .env.local                       # Real secrets — gitignored
├── .gitignore
├── middleware.ts                    # Edge middleware — route guards
├── next.config.mjs
├── tailwind.config.ts               # Extended with accent + paper colors
├── tsconfig.json
├── PROJECT_CONTEXT.md               # This file
├── README.md                        # Setup/run instructions

├── app/
│   ├── layout.tsx                   # Root layout — DM Sans font, global CSS
│   ├── globals.css                  # Tailwind + range input accent-color
│   ├── page.tsx                     # PUBLIC scanner page (Server Component)
│   ├── not-found.tsx                # Default 404 (renders NotFoundPage component)
│   ├── _404/
│   │   └── page.tsx                 # Internal proxy — called by middleware rewrite for probe routes
│   ├── [adminPath]/
│   │   └── page.tsx                 # Admin dashboard — dynamic route, auth-gated
│   └── api/
│       ├── auth/
│       │   └── verify/
│       │       └── route.ts         # POST — validates password, sets admin_session cookie
│       └── responses/
│           └── route.ts             # POST — validates + stores visitor poll/note submissions

├── components/
│   ├── NotFoundPage.tsx             # Generic "404 / Page not found" UI
│   ├── LoginForm.tsx                # Client Component — password form for admin login
│   ├── ScannerPage.tsx              # Client Component — full public scanner page UI + state
│   ├── AdminTabs.tsx                # Client Component — tab navigation for admin dashboard
│   └── tabs/
│       ├── AnalyticsTab.tsx         # Server Component — fetches + renders analytics data
│       └── ScanChart.tsx            # Client Component — Canvas API line chart (no external lib)

├── lib/
│   ├── auth.ts                      # isAdminAuthenticated(request) + getAdminPath()
│   └── supabase/
│       ├── admin.ts                 # Service-role Supabase client (server-only, bypasses RLS)
│       ├── client.ts                # Browser-side Supabase client (createBrowserClient)
│       └── server.ts                # SSR Supabase client (createServerClient, cookie-aware)

└── types/
    └── database.ts                  # Profile, Scan, Response interfaces + Database type
```

---

## Security architecture

### Admin route obscurity
- The admin URL slug is stored only in `ADMIN_ROUTE_NAME` (env var, server-side only).
- It is **never** in any source file, client bundle, API response, or log.
- `app/[adminPath]/page.tsx` reads the env var server-side, compares to `params.adminPath`, and calls `notFound()` for any non-matching path — indistinguishable from a real 404.

### Probe route decoy
`middleware.ts` intercepts these paths: `/admin`, `/dashboard`, `/login`, `/cms`, `/wp-admin`, `/administrator`. It rewrites them to `app/_404/page.tsx` (which calls `notFound()`) — the browser sees the original URL, gets HTTP 404, and the `app/not-found.tsx` component is rendered. This is not a redirect; there is no `Location` header to reveal anything.

### Admin authentication
- `POST /api/auth/verify` accepts `{ password: string }`.
- Password is validated with Zod (non-empty, max 200 chars).
- Timing-safe comparison: both the input and the stored password are SHA-256 hashed before `crypto.timingSafeEqual`. Hashing to a fixed-length digest prevents both character-timing leaks and length-timing leaks.
- On success: sets an `httpOnly`, `sameSite: strict`, `maxAge: 86400` cookie named `admin_session` containing a UUID v4. `secure: true` in production.
- The cookie cannot be read by client-side JavaScript.
- The login form (`LoginForm.tsx`) submits to `/api/auth/verify` and calls `window.location.reload()` on success — it never needs to know the admin path.

### Rate limiting
Both auth and response submission use an in-memory `Map<string, { count, resetAt }>`:
- `POST /api/auth/verify`: 3 failed attempts per IP per hour. After limit, returns `200 { success: false }` — identical to wrong password. The caller cannot detect they are rate-limited.
- `POST /api/responses`: 5 submissions per IP hash per hour.
- **Important:** In-memory rate limits reset on server restart and do not work across multiple instances. Suitable for a personal single-instance deployment; replace with Redis if scaling.

### Visitor privacy
- Raw IP addresses are **never stored**. All storage uses SHA-256 hashes of the IP.
- `scans.ip_hash` and `responses.device_hash` both contain the hex digest, not the IP.

---

## Session token system

Each page load of the public scanner page (`/`) generates a UUID v4 `sessionToken` server-side. The flow:

1. Server generates `sessionToken`, hashes visitor IP, inserts into `scans` table (fire-and-forget — doesn't block render).
2. Server passes `sessionToken` and `profile` data to `ScannerPage` (Client Component) as props.
3. Client starts a 15-minute countdown from mount. A thin progress bar drains silently.
4. On submit, the client POSTs `{ session_token, poll_answer, comment, commenter_name }` to `POST /api/responses`.
5. The API verifies the token exists in `scans` and `scanned_at >= now() - 15 minutes`. If the window has passed, it returns `{ success: false, message: "This link has expired." }`.
6. The API also checks that no `responses` row already exists for this `session_token` (one submission per scan).
7. On success, the client sets `localStorage.scanme_submitted = "true"`.

**Client-side states in `ScannerPage.tsx`:**
- `checking` — brief, while `useEffect` reads localStorage (renders nothing to avoid hydration flash)
- `already_submitted` — localStorage flag found; warm "you've already left a note" message
- `active` — normal form view with draining progress bar
- `expired` — 15-minute timer elapsed; form is gone, friendly message shown
- `submitted` — successful API response; thank-you screen with Instagram link + survey link

---

## Supabase client architecture

Three clients, three purposes:

| File | Key | Use |
|---|---|---|
| `lib/supabase/admin.ts` | `SUPABASE_SERVICE_ROLE_KEY` | All server-side writes and admin reads. Bypasses RLS. |
| `lib/supabase/server.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | SSR-aware client for Server Components / API routes that need session-aware queries. Not yet used — reserved for future auth-gated public queries. |
| `lib/supabase/client.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-side client. Not yet used — reserved for future real-time features. |

### Known TypeScript limitation in database types
`types/database.ts` contains hand-authored `Database` type (the shape Supabase SDK expects as a generic). There is a structural incompatibility: the SDK's `GenericTable` requires `Insert` and `Update` to extend `Record<string, unknown>` (an index signature type), and plain TypeScript interfaces without explicit index signatures fail that check in newer SDK versions.

**Workaround:** `createAdminClient()` uses `createClient<any>` rather than `createClient<Database>`. Query results are cast to the specific row interfaces (`Profile`, `Scan`, `Response`) at the call site.

**Permanent fix:** Run `npx supabase gen types typescript --project-id <id>` to generate a properly structured `types/database.ts` from the live schema. The generated file will be compatible with the SDK generics.

---

## Component patterns

### Server Component → Client Component with server-rendered children
`app/[adminPath]/page.tsx` (Server Component) renders `<AnalyticsTab />` (async Server Component) and passes the result as `analyticsContent: React.ReactNode` to `AdminTabs` (Client Component). `AdminTabs` shows/hides the content with Tailwind `hidden`/`block` — no re-fetch when switching tabs.

This is the correct Next.js App Router pattern for: "tab navigation managed client-side, but tab content fetched server-side."

### Auth checks
- **Middleware** (`middleware.ts`): no auth enforcement currently — it only handles probe routes and passes everything else through. Auth is enforced at the page level.
- **Server Components**: `app/[adminPath]/page.tsx` reads the `admin_session` cookie from `next/headers` directly. `AnalyticsTab.tsx` repeats the check as defense-in-depth and calls `redirect()` if the cookie is absent.
- **`lib/auth.ts`** exports `isAdminAuthenticated(request: NextRequest)` for use in API Route Handlers. It takes a `NextRequest` explicitly — it does **not** use `next/headers`, so it is safe to import in middleware. Do not add a `next/headers` import to `lib/auth.ts` — that would break middleware compatibility.

---

## What is built

| Feature | Status |
|---|---|
| Public scanner page (`/`) | ✅ Complete |
| Session token generation + scan logging | ✅ Complete |
| 15-minute session expiry (client + API) | ✅ Complete |
| Already-submitted device lock (localStorage) | ✅ Complete |
| Poll rendering (slider / multiple_choice / open_text) | ✅ Complete |
| Comment + name submission | ✅ Complete |
| Thank-you / expired / already-submitted screens | ✅ Complete |
| `POST /api/responses` with Zod + rate limit + duplicate check | ✅ Complete |
| Security middleware (probe routes → 404) | ✅ Complete |
| Admin login (`POST /api/auth/verify`) | ✅ Complete |
| Admin session cookie (httpOnly, 24h) | ✅ Complete |
| Admin dashboard shell (tabbed layout) | ✅ Complete |
| Analytics tab — stat cards + line chart | ✅ Complete |
| Responses tab | ⬜ Placeholder only |
| Edit Profile tab | ⬜ Placeholder only |
| Profile seed / initial data setup | ⬜ Not built — profile row must be inserted manually into Supabase |
| QR code generation | ⬜ Not built |
| Admin logout | ⬜ Not built |
| Supabase RLS policies | ⬜ Not configured — all writes use service role key |

---

## What to build next

### Responses tab (`components/tabs/ResponsesTab.tsx`)
- Fetch all rows from `responses` joined (or separately) with their `scans` row for `scanned_at`
- Display in a list: submitted_at, commenter_name (or "Anonymous"), poll_answer, comment
- Sort newest first

### Edit Profile tab (`components/tabs/EditProfileTab.tsx`)
- Form that reads the current `profiles` row and allows editing all fields
- `PUT /api/admin/profile` — auth-gated API route that updates the single profile row
- Photo upload: either a URL input or Supabase Storage upload

### Admin logout
- `POST /api/auth/logout` — deletes the `admin_session` cookie
- A logout button in the tab nav or a header

### Profile seed
Currently no mechanism to create the initial profile row. Options:
1. A one-time setup page/endpoint
2. Manual INSERT via Supabase dashboard
3. A seed script in `lib/seed.ts`

### QR code
Generate a QR code pointing to `NEXT_PUBLIC_APP_URL` and display it in the admin dashboard.

---

## Running locally

```bash
npm install
cp .env.example .env.local
# fill in .env.local values
npm run dev
# open http://localhost:3000
```

Admin dashboard is at `http://localhost:3000/$ADMIN_ROUTE_NAME` where `$ADMIN_ROUTE_NAME` is the value from `.env.local`.
