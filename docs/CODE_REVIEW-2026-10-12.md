# Code review — 2026-10-12

**Reviewed:** the multi-tenant build (Next 16.4.0) as of commit-less working tree, 03:59
**Reviewer:** read-only pass. Nothing in this review has been applied.
**For:** whoever picks up the fixes.

Verification run before writing this: `npm run test` (13/13), `tsc --noEmit` (clean),
`npm run build` (compiles, 17 routes), `npm run lint` (**3 errors**), `npm run db:verify`
(15 checks, **1 failing**).

---

## What is in good shape

Worth stating, because the findings below are narrow and the rest is solid.

- **`app/api/t/[code]/respond/route.ts`** is the highest-risk surface in the product and
  it is well built: HMAC session token verified, rate limited by IP hash, Zod-validated
  body, IP hashed via HMAC and never stored raw, blocked-device check, repeat policy
  enforced, required blocks enforced, scale values range-checked against `block.config`,
  choice values checked against the allowed option list, and answer keys filtered to real
  block ids before they reach the `jsonb` column. Critically, `userId` comes from
  `experience.code.userId` — server-derived, never from the request body.
- **`proxy.ts`** correctly ports the deleted `middleware.ts` to the Next 16 name, keeping
  probe-route rewrites, the 10 KiB body cap, security headers and a global API rate limit.
  The rewrite target `app/_404/page.tsx` still exists.
- **Owner query scoping:** 33 of 34 database queries carry an explicit owner predicate.
  `requireOwner()` derives identity from the server-side session and redirects on absence.
- **Schema guarantees survived the edits** — `campaigns_one_live_per_code` still rejects a
  second live campaign, the 30-day free-plan cutoff still filters, deleting a campaign
  still preserves its responses, deleting a code still cascades.

---

## 1. RLS is inert — the app connects as a BYPASSRLS role (P1)

`npm run db:verify` reports this on every run:

```
INFO  connecting role=neondb_owner bypassrls=true force_rls=false read_without_jwt=1 row(s)
FAIL  RLS is enforced for the connecting role — NOT ENFORCED
```

All 39 policies in `lib/db/rls.sql` are dead code. `neondb_owner` holds `BYPASSRLS`, and
`FORCE ROW LEVEL SECURITY` is not set, so a table owner bypasses its own policies. The
auth slice landed without closing this, which means **application-level `userId` scoping
is the only thing enforcing tenant isolation** — and finding 2 is a live example of that
single layer being incomplete.

### Why this is not a one-line fix

Two things make it more than flipping a connection string:

1. **`app_user` cannot log in.** `lib/db/rls.sql` creates it `NOLOGIN`, which is my error —
   a role the application connects as needs `LOGIN` and a password (or Neon's
   `authenticated` role convention). As written the role is unusable.
2. **The visitor write path must not be subject to these policies.** A visitor is
   unauthenticated by design (`docs/PRODUCT_SPEC.md` 5.1: "No login, no account, ever"),
   yet `respond/route.ts` inserts a row whose `user_id` is some *other* person — the code's
   owner. Under `responses_owner` (`user_id = auth.user_id()`) that insert is correctly
   denied. So the visitor path has to keep a privileged connection, or gain a policy of
   its own.

### Recommended path

Owner reads/writes go through an RLS-enforced connection; the visitor write path stays on
a privileged one and keeps its existing validation as its control.

1. **Make the role usable** — in `lib/db/rls.sql`, replace the `NOLOGIN` role with one that
   can connect, and grant it nothing beyond the existing table privileges.
2. **Issue JWTs.** `lib/auth-server.ts` has no JWT plugin. Add Better Auth's `jwt` plugin
   so it exposes JWKS at `/api/auth/jwks` and can mint a per-session token.
3. **Register the JWKS URL with Neon** (project settings → RLS), so `pg_session_jwt`
   validates it and `auth.user_id()` resolves to `users.id`.
4. **Add a per-request client** alongside the existing `db` in `lib/db/index.ts`:

   ```ts
   /** Owner-scoped, RLS-enforced. auth.user_id() resolves from the session JWT. */
   export function dbAs(authToken: string) {
     return drizzle(neon(process.env.DATABASE_URL_APP!, { authToken }), { schema })
   }
   ```

   Keep the existing `db` export for migrations and the visitor write path, and say so in
   its doc comment.
5. **Move owner-facing queries to `dbAs(token)`** — `app/app/**`, `lib/owner.ts`,
   `lib/product.ts` (its owner-scoped functions only).
6. **Then** `ALTER TABLE ... FORCE ROW LEVEL SECURITY` on the 12 product tables, and
   re-run `npm run db:verify` — the failing check flips to PASS on its own.

Do steps 2–5 before step 6. Setting `FORCE` first, or pointing `DATABASE_URL` at the
restricted role before JWTs flow, breaks every read: with no token `auth.user_id()` is
null and each policy correctly denies everything.

### Also

The `DATABASE_URL` currently in `.env.local` is the **owner** role and was pasted through a
chat transcript. Rotate it in the Neon dashboard. The app should not be using the owner
role once the above lands regardless.

---

## 2. `app/app/insights/page.tsx:16` — unscoped cross-tenant read (P1)

```ts
db.select({ codeId: schema.scans.codeId, scannedAt: schema.scans.scannedAt })
  .from(schema.scans)
  .where(gte(schema.scans.scannedAt, since))     // ← no owner predicate
  .orderBy(desc(schema.scans.scannedAt)),
```

This selects **every tenant's scans** from the last seven days. The owner filter happens
afterwards, in JavaScript, on line 19:

```ts
for (const scan of scans) { if (!codeIds.has(scan.codeId)) continue; ... }
```

**Impact.** No cross-tenant data is rendered today, so this is not an active disclosure.
But every tenant's rows cross the database boundary into this process, with finding 1
meaning there is no backstop behind the JS filter; any refactor that drops line 19 leaks
immediately; and the query is an unbounded scan that grows with *total platform* scan
volume rather than the owner's, so it degrades for every user as the product succeeds.

**This file is the outlier.** `lib/product.ts:101` already does it correctly:

```ts
db.select({ value: sql<number>`count(*)::int` }).from(schema.scans)
  .innerJoin(schema.codes, eq(schema.codes.id, schema.scans.codeId))
  .where(eq(schema.codes.userId, userId))
```

**Fix** — push the predicate into SQL. Either mirror the join above, or use the `codeIds`
already fetched on line 12:

```diff
-import { desc, eq, gte } from 'drizzle-orm'
+import { and, desc, eq, gte, inArray } from 'drizzle-orm'
@@
   const codes = await db.select({ id: schema.codes.id }).from(schema.codes).where(eq(schema.codes.userId, session.user.id))
-  const codeIds = new Set(codes.map((code) => code.id))
+  const codeIds = codes.map((code) => code.id)
   const [summary, scans] = await Promise.all([
     ownerSummary(session.user.id),
-    db.select({ codeId: schema.scans.codeId, scannedAt: schema.scans.scannedAt }).from(schema.scans).where(gte(schema.scans.scannedAt, since)).orderBy(desc(schema.scans.scannedAt)),
+    codeIds.length === 0
+      ? Promise.resolve([])
+      : db.select({ codeId: schema.scans.codeId, scannedAt: schema.scans.scannedAt }).from(schema.scans).where(and(inArray(schema.scans.codeId, codeIds), gte(schema.scans.scannedAt, since))).orderBy(desc(schema.scans.scannedAt)),
   ])
```

Then drop the now-redundant guard on line 19 (`if (!codeIds.has(...)) continue`).

Note the `codeIds.length === 0` branch: `inArray` with an empty array generates invalid
SQL in some Drizzle versions, and a brand-new owner has no codes until
`ensureOwnerSetup` has run.

**Worth a check once fixed.** This class of bug is invisible to tests that only ever have
one tenant in the database. A check that seeds two owners and asserts owner A's insights
exclude owner B's scans would have caught it, and would catch the next one.

---

## 3. `npm run lint` fails with 3 errors (P2)

`AGENTS.md` requires lint to pass before a feature is complete, and these arrived with the
Next 16 upgrade's stricter flat config (`eslint.config.mjs`).

### 3a. `components/ThemeToggle.tsx:11` — setState synchronously in an effect

```
error  Calling setState synchronously within an effect can trigger cascading renders
```

The effect reads `localStorage` and calls `setDark` on mount. There is a **second, related
bug**: `app/layout.tsx:21` hardcodes `<html lang="en" data-theme="light">` with no
pre-paint script, so a dark-mode visitor gets a flash of light theme on every page load.
One change fixes both — set the attribute before paint, then initialise state from the DOM
rather than from an effect.

In `app/layout.tsx`, inside `<head>`:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `try{document.documentElement.dataset.theme=localStorage.getItem('scanme-theme')||'light'}catch(e){}`,
  }}
/>
```

In `components/ThemeToggle.tsx` — the effect goes away entirely:

```diff
-import { useEffect, useState } from 'react'
+import { useState } from 'react'
@@
-  const [dark, setDark] = useState(false)
-
-  useEffect(() => {
-    const nextDark = window.localStorage.getItem('scanme-theme') === 'dark'
-    setDark(nextDark)
-    document.documentElement.dataset.theme = nextDark ? 'dark' : 'light'
-  }, [])
+  const [dark, setDark] = useState(
+    () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
+  )
```

`toggle()` already writes both the DOM attribute and `localStorage`, so it needs no change.

### 3b. `app/app/insights/page.tsx:10` — impure call during render

```
error  `Date.now` is an impure function  (react-hooks/purity)
```

Arguably a false positive for an async Server Component, but it fails the build gate. It
is also duplicated logic — `lib/product.ts` computes windows too. Move it out of the
component into a helper and the rule stops firing:

```ts
// lib/product.ts
export function startOfDayDaysAgo(days: number): Date {
  const date = new Date(Date.now() - days * 86_400_000)
  date.setHours(0, 0, 0, 0)
  return date
}
```

```diff
-  const since = new Date(Date.now() - 6 * 86_400_000)
-  since.setHours(0, 0, 0, 0)
+  const since = startOfDayDaysAgo(6)
```

If the rule still objects, `eslint-disable-next-line react-hooks/purity` with a comment
explaining that RSC render is not React render is defensible — but prefer the helper.

### 3c. `components/NotFoundPage.tsx:7` — raw `<a>` for internal navigation

```diff
+import Link from 'next/link'
@@
-        <a
-          href="/"
+        <Link
+          href="/"
           className="inline-block text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
         >
           Go home
-        </a>
+        </Link>
```

This file predates the rebuild and is the only survivor still styled with hardcoded
Tailwind greys (`bg-white`, `text-gray-800`) rather than the `var(--…)` tokens the rest of
the app uses. It renders a white page in dark mode. Worth retheming while it is open.

---

## 4. Submission rate limiter only counts successes (P3)

`app/api/t/[code]/respond/route.ts` calls `submissionLimiter.increment(ipHash)` on the
last line, after the insert succeeds. Every rejected attempt — bad token, failed
validation, repeat-policy conflict — is therefore unmetered, so one IP can run
`getVisitorExperience()` plus the blocked-device lookup plus the duplicate check without
limit. The expensive write is protected; the reads in front of it are not.

Move the increment to immediately after the limit check, so an attempt is counted whether
or not it succeeds:

```diff
   if (submissionLimiter.isLimited(ipHash)) return NextResponse.json({ error: 'Please wait before sending another response.' }, { status: 429 })
+  submissionLimiter.increment(ipHash)
@@
   await db.insert(schema.responses).values({ ... })
-  submissionLimiter.increment(ipHash)
   return NextResponse.json({ ok: true }, { status: 201 })
```

Five attempts per hour per IP is tight for counting failures too, so consider raising the
ceiling in `lib/rate-limiter.ts` at the same time, or keeping two limiters with different
windows (attempts vs. successful submissions).

### Related ceiling, not a finding

`RateLimiter` is an in-memory `Map`, so on serverless every instance has its own counters
and the real limit is `max × instances`. It was acceptable for a single-tenant POC and is
now load-bearing on a public endpoint. A shared store (Neon table with a periodic sweep,
or Upstash) is the upgrade path — but measure first; `docs/PRODUCT_SPEC.md` does not
justify new infrastructure yet.

---

## Suggested order

1. Finding 2 — one file, removes the cross-tenant read immediately
2. Finding 3 — unblocks `npm run lint` as a gate, and fixes the theme flash
3. Finding 4 — three lines
4. Finding 1 — the real work; needs the JWT plugin, Neon JWKS config and a role that can
   log in, and should land as its own slice

After each: `npm run test && npm run lint && npm run build && npm run db:verify`.

`db:verify`'s one failing check is deliberate — it stays red until finding 1 is closed,
and flips to PASS with no edit to the script.
