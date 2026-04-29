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
| Storage | Supabase Storage | `avatars` bucket (public) — stores `profile-photo.[ext]` |
| Supabase client | `@supabase/supabase-js` v2.105.1 + `@supabase/ssr` | |
| Validation | Zod v4 | Required on every API route — no exceptions |
| Session tokens | HMAC-signed (Node.js `crypto`) | Format: `1.<base36-ts>.<sha256-hex>`. Replaced UUID v4 + DB lookup. |
| QR code | `qrcode` npm package | Client-side generation, no external service |
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
| `ADMIN_PASSWORD` | Password for the admin dashboard login AND the HMAC signing secret for session tokens |
| `ADMIN_ROUTE_NAME` | URL slug for the admin route — **never hardcoded anywhere in source** |
| `NEXT_PUBLIC_APP_URL` | Full public URL (e.g. `https://scanme.example.com`) — used by QR code tab |

**Important:** `ADMIN_PASSWORD` serves two purposes: it is the login password AND the HMAC secret used to sign and verify session tokens. Changing it invalidates all in-flight session tokens (they expire after 15 minutes anyway, so this is benign).

**Important:** Next.js only reads `.env.local` at process startup. After any change to `.env.local`, the dev server must be restarted (`Ctrl+C` then `npm run dev`) for the new values to take effect.

---

## Database schema

Three tables, plus one migration applied after initial setup.

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
  test_mode     boolean not null default false,  -- added via migration
  created_at    timestamptz default now()
);

-- One row per page visit (QR code scan)
create table scans (
  id            uuid primary key default gen_random_uuid(),
  scanned_at    timestamptz default now(),
  session_token text not null,  -- text, not uuid (HMAC tokens are not UUIDs)
  ip_hash       text            -- SHA-256 of visitor IP — raw IP is never stored
);

-- One row per form submission
create table responses (
  id             uuid primary key default gen_random_uuid(),
  session_token  text not null,  -- text, not uuid
  poll_answer    text,
  comment        text,
  commenter_name text,
  device_hash    text,           -- SHA-256 of visitor IP at submission time
  submitted_at   timestamptz default now()
);
```

**Applied migration** (run once in Supabase SQL editor — already applied to the live database):
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS test_mode boolean NOT NULL DEFAULT false;
ALTER TABLE scans ALTER COLUMN session_token TYPE text;
ALTER TABLE responses ALTER COLUMN session_token TYPE text;
```

**Important note:** The `poll_type` check constraint uses `'slider'`, `'multiple_choice'`, and `'open_text'` — not `'text'`. Use the SQL above when recreating tables.

---

## File structure (current)

```
/
├── .env.example                     # Safe-to-commit env template
├── .env.local                       # Real secrets — gitignored
├── .gitignore
├── middleware.ts                    # Edge middleware — security headers, rate limit, probe decoys
├── next.config.mjs
├── tailwind.config.ts               # Extended with accent + paper colors
├── tsconfig.json
├── PROJECT_CONTEXT.md               # This file
├── README.md                        # Setup/run instructions

├── app/
│   ├── layout.tsx                   # Root layout — DM Sans font, global CSS
│   ├── globals.css                  # Tailwind + range input accent-color
│   ├── loading.tsx                  # Scanner page skeleton (shown while page.tsx streams)
│   ├── page.tsx                     # PUBLIC scanner page — HMAC token routing, test mode, fire-and-forget scan insert
│   ├── not-found.tsx                # Default 404 (renders NotFoundPage component)
│   ├── _404/
│   │   └── page.tsx                 # Internal proxy — called by middleware rewrite for probe routes
│   ├── [adminPath]/
│   │   ├── loading.tsx              # Admin skeleton (shown while page.tsx streams)
│   │   └── page.tsx                 # Admin dashboard — dynamic route, auth-gated, fetches test_mode
│   └── api/
│       ├── auth/
│       │   └── verify/
│       │       └── route.ts         # POST — validates password, sets admin_session cookie
│       ├── profile/
│       │   └── route.ts             # GET — return profile; POST — update profile; PATCH — toggle test_mode
│       ├── upload/
│       │   └── route.ts             # POST — admin-only photo upload to Supabase Storage
│       └── responses/
│           ├── route.ts             # POST — validates + stores submissions; all checks gated by test_mode
│           └── [id]/
│               └── route.ts         # DELETE — removes a response row (admin-only)

├── components/
│   ├── NotFoundPage.tsx             # Generic "404 / Page not found" UI
│   ├── LoginForm.tsx                # Client Component — password form for admin login
│   ├── ScannerPage.tsx              # Client Component — full public scanner page UI + test mode support
│   ├── AdminTabs.tsx                # Client Component — tab nav + TestModeToggle in header
│   └── tabs/
│       ├── AnalyticsTab.tsx         # Async Server Component — stat cards + line chart
│       ├── ScanChart.tsx            # Client Component — Canvas API line chart (no external lib)
│       ├── ResponsesTab.tsx         # Async Server Component — poll results + comments feed
│       ├── ResponsesClient.tsx      # Client Component — comment cards with delete + fade
│       ├── EditProfileTab.tsx       # Client Component — form with photo upload UI
│       └── QRCodeTab.tsx            # Client Component — QR code preview + download

├── lib/
│   ├── auth.ts                      # isAdminAuthenticated(request) + getAdminPath()
│   ├── session-token.ts             # generateSessionToken() + verifySessionToken() — HMAC, no DB
│   ├── rate-limiter.ts              # RateLimiter class + authLimiter / submissionLimiter
│   └── supabase/
│       ├── admin.ts                 # Service-role client with cache: 'no-store' on all fetches
│       ├── client.ts                # Browser-side Supabase client (createBrowserClient)
│       └── server.ts                # SSR Supabase client (createServerClient, cookie-aware)

└── types/
    └── database.ts                  # Profile (incl. test_mode), Scan, Response interfaces + Database type
```

---

## Security architecture

### Admin route obscurity
- The admin URL slug is stored only in `ADMIN_ROUTE_NAME` (env var, server-side only).
- It is **never** in any source file, client bundle, API response, log, or HTTP header.
- `app/[adminPath]/page.tsx` reads the env var server-side, compares to `params.adminPath`, and calls `notFound()` for any non-matching path — indistinguishable from a real 404.
- **Critical:** The defense-in-depth auth checks in `AnalyticsTab.tsx` and `ResponsesTab.tsx` use `redirect('/')`, not `redirect(\`/${getAdminPath()}\`)`. The latter would emit the admin path in the HTTP `Location` header, leaking it to the browser. Never use `getAdminPath()` inside a `redirect()` call.

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
Rate limiting lives in `lib/rate-limiter.ts` as a `RateLimiter` class (module-level `Map`, no external dependency). Three named instances are exported:

| Instance | Limit | Window | Used in |
|---|---|---|---|
| `authLimiter` | 3 failures | per IP / hour | `app/api/auth/verify/route.ts` |
| `submissionLimiter` | 5 submissions | per IP hash / hour | `app/api/responses/route.ts` |
| `apiRateLimiter` | 60 requests | per IP / minute | `middleware.ts` (Edge-local instance) |

- Auth rate limit counts only **failures**; a successful login clears the counter.
- After 3 failed auth attempts the response is identical to a wrong password — the caller cannot detect the rate limit.
- The middleware's `apiRateLimiter` is a separate module-level instance (not the exported singleton) because Edge workers have a separate V8 context from Node.js API route workers.
- Requests with a valid `admin_session` cookie are **exempt** from the middleware API rate limit — admin operations should never be blocked.
- **Important:** All in-memory rate limits reset on server restart and do not work across multiple instances. Suitable for a personal single-instance deployment; replace with Redis if scaling.

### Security headers
`middleware.ts` adds these headers to every response (pages, API routes, rewrites):
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

### Request body size limit
POST requests with a `Content-Length` header exceeding 10 240 bytes (10 kb) are rejected with HTTP 413 at the middleware level — **except** `/api/upload`, which is exempt because it handles files up to 5 MB and performs its own size validation inside the route handler.

### Visitor privacy
- Raw IP addresses are **never stored**. All storage uses SHA-256 hashes of the IP.
- `scans.ip_hash` and `responses.device_hash` both contain the hex digest, not the IP.

---

## Session token system

The QR code on the shirt points to the **permanent base URL**. Session tokens are HMAC-signed and self-validating — no database round-trip is needed to check freshness.

**Token format:** `1.<base36-timestamp>.<sha256-hmac-hex>` (64 hex chars for the HMAC)
- Version prefix `1` allows future format changes.
- Timestamp is `Date.now().toString(36)` — milliseconds since epoch in base 36.
- HMAC is `sha256(secret, "1.<base36-ts>")` where `secret` is `ADMIN_PASSWORD`.
- Shape validated with regex `/^1\.[0-9a-z]+\.[0-9a-f]{64}$/` before crypto work.

**Full scan flow:**

1. Visitor hits `/` with no `token` query parameter.
2. Server generates an HMAC token, SHA-256-hashes the visitor IP, and fires a **non-awaited** insert into the `scans` table (analytics only — does not block the redirect).
3. Server immediately redirects to `/?token=<token>` (no DB wait).
4. Browser follows the redirect. Server receives the request with `token` in `searchParams`.
5. Server validates the token: regex shape check → HMAC verify → timestamp age check (≤ 15 minutes). All pure crypto, no DB call.
6. If invalid or expired → server renders `<ExpiredScreen />` directly (static HTML, no client state).
7. If valid → server renders `<ScannerPage profile={profile} sessionToken={token} />`.
8. Client starts a 15-minute countdown from mount. A thin progress bar drains silently.
9. On submit, the client POSTs `{ session_token, poll_answer, comment, commenter_name }` to `POST /api/responses`.
10. The API re-validates the HMAC + expiry (server-side source of truth), checks for duplicate token in the `responses` table, and inserts the response row.
11. On success, the client sets `localStorage.scanme_submitted = "true"` and transitions to the thank-you screen.

**`lib/session-token.ts` API:**
```typescript
generateSessionToken(secret: string): string
verifySessionToken(token: string, secret: string): number | null  // returns issuedAt ms, or null if invalid
```

**Client-side states in `ScannerPage.tsx`:**
- `checking` — brief, while `useEffect` reads localStorage (renders nothing to avoid hydration flash)
- `already_submitted` — localStorage flag found; warm "you've already left a note" message
- `active` — normal form view with draining progress bar
- `expired` — 15-minute client timer elapsed; form is gone, friendly message shown
- `submitted` — successful API response; thank-you screen with Instagram link + survey link

**Note:** The server-side expiry check is the authoritative gate. The client countdown is a UX indicator only.

---

## Test mode

A `test_mode boolean` column on the `profiles` table (default `false`) disables all visitor-facing restrictions so the full flow can be tested repeatedly without friction.

### What test mode bypasses

| Restriction | Live mode | Test mode |
|---|---|---|
| Session token HMAC + expiry | Enforced | Skipped |
| One response per session token (DB check) | Enforced | Skipped |
| Submission rate limit (per IP hash) | Enforced | Skipped |
| localStorage `scanme_submitted` read | Blocks re-submission | Skipped |
| localStorage `scanme_submitted` write | Written on submit | Not written |
| Client countdown timer | Runs, expires form | Not started |
| Progress bar | Shown | Hidden |

### How it works
- **Page load (`app/page.tsx`):** When `profile.test_mode` is true, the token validation, redirect, and scan insert are all skipped. A fresh HMAC token is generated and the page renders directly with `testMode` prop.
- **API (`app/api/responses/route.ts`):** All security checks are inside `if (!testMode)` blocks. The `test_mode` flag is fetched from the `profiles` table at the start of each request.
- **Client (`ScannerPage.tsx`):** Receives `testMode` prop. In test mode: skips localStorage, skips countdown, shows amber banner instead of progress bar. After a successful submit, localStorage is not written and the thank-you screen still appears (so the flow is fully visible). Refreshing the page returns to the active form.
- **Admin toggle:** `TestModeToggle` is always visible in the `AdminTabs` header regardless of active tab. It's an amber pill button that saves immediately via `PATCH /api/profile`. The `app/[adminPath]/page.tsx` fetches the current `test_mode` value on each load to seed the toggle's initial state.

### Test mode banner
When `test_mode` is true, the public page shows a fixed amber bar at the very top: "Test mode — restrictions disabled". This replaces the live-mode progress bar in the same position.

---

## Admin dashboard architecture

### Tab system
`app/[adminPath]/page.tsx` (Server Component) wraps each async tab in a `<Suspense>` boundary and passes the result as a `React.ReactNode` prop to `AdminTabs` (Client Component). `AdminTabs` shows/hides each tab's content with Tailwind `hidden`/`block` — no re-fetch when switching tabs.

```
AdminPage (Server Component)
├── <Suspense fallback={<TabSpinner />}><AnalyticsTab /></Suspense>  → analyticsContent prop
├── <Suspense fallback={<TabSpinner />}><ResponsesTab /></Suspense>  → responsesContent prop
├── <EditProfileTab />                                              → editProfileContent prop
└── initialTestMode (from profiles table)                          → prop on AdminTabs
         ↓
AdminTabs (Client Component) — shows/hides with block/hidden
├── TestModeToggle (always visible in header, saves via PATCH /api/profile)
└── QRCodeTab (client-rendered when QR Code tab is active)
```

The Suspense wrappers enable streaming SSR: the tab navigation renders immediately and each tab's content streams in as its data resolves, showing a spinner in the meantime.

### Analytics tab
`AnalyticsTab.tsx` runs 7 Supabase queries in parallel (`Promise.all`). Shows:
- Stat cards: Today / This week / All time scans, response rate
- 14-day scan line chart (Canvas API, `ScanChart.tsx`)
- Poll responses + comments totals
- **Empty state** when `totalScans === 0`: "No scans yet. Once you wear the shirt, scans will appear here."
- **Error state** when primary query fails: "Failed to load data. Please refresh the page."

### Responses tab
`ResponsesTab.tsx` (async Server Component) + `ResponsesClient.tsx` (Client Component):
- Poll results section: slider average + distribution bars, multiple-choice bars with percentages, or open-text card list — depending on `profile.poll_type`
- Comments feed: name, relative timestamp, comment text, delete button
- Delete calls `DELETE /api/responses/[id]` (admin-auth gated, UUID-validated), removes the card with a CSS opacity fade — no page reload
- **Empty state** for poll: "No poll responses yet."
- **Empty state** for comments: "No comments yet — get out there and wear the shirt."
- **Error state** when queries fail: "Failed to load data. Please refresh the page."

### Edit Profile tab
`EditProfileTab.tsx` (Client Component) fetches the current profile via `GET /api/profile` on mount and pre-fills all fields. Four sections: Profile, Poll, Leave a note prompt, Links. Saves via `POST /api/profile`.

- **Photo field:** circular preview (96 px, initials fallback if no photo), "Upload photo" button opens a hidden `<input type="file">`, client-side validation (type: jpg/png/webp; size: ≤ 5 MB), local blob preview before upload, "Upload" confirm button, loading/success/error states, "Or paste a URL instead" toggle that reveals the original URL text input as a fallback.
- Poll type toggle: three buttons (Slider / Multiple choice / Open question) — one active at a time
- Multiple choice options: dynamic list, add/remove, minimum 2 enforced
- Form state is preserved across tab switches (component is always mounted via `block/hidden`)
- **Loading state**: 4 animated skeleton cards while `GET /api/profile` resolves
- **Error state**: "Failed to load data. Please refresh the page." if the fetch fails
- **Save feedback**: inline "Changes saved. Your public page is updated." for 3 seconds on success; inline error message on failure

### QR Code tab
`QRCodeTab.tsx` (Client Component, `'use client'`):
- Reads `NEXT_PUBLIC_APP_URL` from the environment at module load time.
- Generates a 320 px QR code preview on mount using `QRCode.toDataURL()` (error correction level H).
- "Download PNG (1200 × 1200 px)" button generates a fresh 1200 px render and triggers a browser download of `scanme-qrcode.png`.
- Shows the URL below the QR code for reference.
- Amber print tip: minimum 5 × 5 cm for reliable scanning, 7 × 7 cm recommended for arm-length distances.
- Shows a clear message if `NEXT_PUBLIC_APP_URL` is not set.

### Profile API (`app/api/profile/route.ts`)
- `GET` — returns the current profile row (admin session required)
- `POST` — validates with Zod + `superRefine` cross-field rules:
  - `photo_url` and `survey_link` must be valid URLs if non-empty
  - `poll_options` must have ≥ 2 items when `poll_type === 'multiple_choice'`
  - All string fields are trimmed; empty strings saved as `null`
  - Fetches the profile row's `id` first, then updates by that id (safe single-row update)
- `PATCH` — accepts `{ test_mode: boolean }`, updates only the `test_mode` column (admin session required)

### Upload API (`app/api/upload/route.ts`)
- `POST` — admin session required; accepts `multipart/form-data` with a `file` field
- Validates MIME type: `image/jpeg`, `image/png`, `image/webp` only
- Validates size: ≤ 5 MB
- Uploads to Supabase Storage bucket `avatars` as `profile-photo.[ext]` with `upsert: true` — always overwrites the previous photo
- Gets the public URL via `storage.getPublicUrl()` and updates `profiles.photo_url`
- Returns `{ success: true, url: publicUrl }` or a generic error message (internal errors logged server-side only)

---

## Supabase client architecture

Three clients, three purposes:

| File | Key | Use |
|---|---|---|
| `lib/supabase/admin.ts` | `SUPABASE_SERVICE_ROLE_KEY` | All server-side writes and admin reads. Bypasses RLS. |
| `lib/supabase/server.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | SSR-aware client for Server Components / API routes that need session-aware queries. Not yet used — reserved for future auth-gated public queries. |
| `lib/supabase/client.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-side client. Not yet used — reserved for future real-time features. |

`createAdminClient()` passes a `global.fetch` override that sets `cache: 'no-store'` on every request. This bypasses Next.js's Data Cache, which would otherwise serve stale profile data across requests even with `export const dynamic = 'force-dynamic'`. Without this override, changes made in the admin dashboard (profile edits, test mode toggle) would not appear on the public page until the cache expired.

### Known TypeScript limitation in database types
`types/database.ts` contains a hand-authored `Database` type. There is a structural incompatibility: the SDK's `GenericTable` requires `Insert` and `Update` to extend `Record<string, unknown>` (an index signature type), and plain TypeScript interfaces without explicit index signatures fail that check in newer SDK versions.

**Workaround:** `createAdminClient()` uses `createClient<any>` rather than `createClient<Database>`. Query results are cast to the specific row interfaces (`Profile`, `Scan`, `Response`) at the call site.

**Permanent fix:** Run `npx supabase gen types typescript --project-id <id>` to generate a properly structured `types/database.ts` from the live schema. The generated file will be compatible with the SDK generics.

---

## Auth check pattern

`lib/auth.ts` exports two functions used server-side only:

- `isAdminAuthenticated(request: NextRequest): boolean` — reads the `admin_session` cookie from a `NextRequest`. Used in API Route Handlers. Does **not** use `next/headers` — safe to call from middleware. Do not add `next/headers` imports to `lib/auth.ts`.
- `getAdminPath(): string` — returns `process.env.ADMIN_ROUTE_NAME ?? ''`. Used only in `app/[adminPath]/page.tsx` (for comparison, not in any response).

Server Components (`AnalyticsTab`, `ResponsesTab`) read the `admin_session` cookie directly from `next/headers` for their defense-in-depth check. If the check fails they `redirect('/')` — never `redirect(\`/${getAdminPath()}\`)`, which would leak the admin path in the `Location` header.

---

## Loading and error states

### Public page (`app/page.tsx`)
- Supabase error code `PGRST116` ("no rows found") → "Coming soon." — profile hasn't been seeded yet
- Any other Supabase error → "Something went wrong loading this page. Please try scanning the QR code again."
- `app/loading.tsx` shows a full-page skeleton (matching the ScannerPage layout) while the server component streams

### Admin dashboard
- `app/[adminPath]/loading.tsx` shows a skeleton of the tab navigation + analytics card layout
- Each tab wraps its async server component in `<Suspense fallback={<TabSpinner />}>` — a centered spinner renders until data resolves
- `AnalyticsTab`, `ResponsesTab`, `EditProfileTab` each show "Failed to load data. Please refresh the page." on DB or network failure

---

## What is built

| Feature | Status |
|---|---|
| Public scanner page (`/`) | ✅ Complete |
| HMAC session tokens (no DB round-trip, self-validating) | ✅ Complete |
| 15-minute session expiry (server-side HMAC + timestamp) | ✅ Complete |
| Fire-and-forget scan insert (analytics, does not block redirect) | ✅ Complete |
| Already-submitted device lock (localStorage) | ✅ Complete |
| Poll rendering (slider / multiple_choice / open_text) | ✅ Complete |
| Comment + name submission | ✅ Complete |
| Thank-you / expired / already-submitted screens | ✅ Complete |
| `POST /api/responses` with Zod + rate limit + duplicate check | ✅ Complete |
| `DELETE /api/responses/[id]` — admin-only comment deletion | ✅ Complete |
| Security middleware (probe routes → 404, security headers, rate limit, body size limit) | ✅ Complete |
| Admin session exempt from API rate limit | ✅ Complete |
| Admin login (`POST /api/auth/verify`) | ✅ Complete |
| Admin session cookie (httpOnly, 24h) | ✅ Complete |
| Admin dashboard shell (tabbed layout, streaming Suspense) | ✅ Complete |
| Analytics tab — stat cards + line chart + empty/error states | ✅ Complete |
| Responses tab — poll results + comment feed + delete | ✅ Complete |
| Edit Profile tab — all fields, photo upload, save, feedback | ✅ Complete |
| `GET /api/profile` + `POST /api/profile` + `PATCH /api/profile` | ✅ Complete |
| Photo upload to Supabase Storage (`POST /api/upload`) | ✅ Complete |
| QR code tab — preview + 1200 px download | ✅ Complete |
| Test mode — full restriction bypass for development | ✅ Complete |
| Test mode toggle in admin header (persisted to DB) | ✅ Complete |
| Test mode banner on public page | ✅ Complete |
| Supabase Data Cache bypass (`cache: 'no-store'` on all fetches) | ✅ Complete |
| Loading skeletons (public page + admin) | ✅ Complete |
| Error and empty states throughout | ✅ Complete |
| Profile seed / initial data setup | ⬜ Not built — profile row must be inserted manually into Supabase |
| Admin logout | ⬜ Not built |
| Supabase RLS policies | ⬜ Not configured — all writes use service role key |

---

## What to build next

### Profile seed
Currently no mechanism to create the initial profile row. Without it, the public page shows "Coming soon." Options:
1. A one-time setup page/endpoint
2. Manual `INSERT` via Supabase dashboard (quickest for now)
3. A seed script in `lib/seed.ts`

### Admin logout
- `POST /api/auth/logout` — clears the `admin_session` cookie
- A logout button in the `AdminTabs` header

### Supabase RLS policies
All writes currently use the service role key, bypassing Row Level Security. For production hardening, add RLS policies allowing only service role inserts/updates on `scans`, `responses`, and `profiles`.

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

**After any change to `.env.local`, restart the dev server.** Next.js reads the file once at startup; changes are not hot-reloaded.

To seed the initial profile row, run this SQL in the Supabase dashboard:

```sql
insert into profiles (name, bio, poll_type, poll_question, note_intro)
values (
  'Your Name',
  'A short bio shown on the public page.',
  'slider',
  'How interesting was this conversation?',
  'Hey! You just scanned my shirt. Leave me a note — I read every one.'
);
```

Then use the Edit Profile tab in the admin dashboard to update all fields, upload a photo, and add your Instagram handle and survey link.
