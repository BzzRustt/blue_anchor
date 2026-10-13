# ScanMe — Product Specification

**Status:** agreed product direction, pre-build
**Supersedes:** the feature promises implicit in `scanme-premium-prototype.html`
**Companion doc:** `PROJECT_CONTEXT.md` (what the single-tenant POC actually does today)

This is the source of truth for what ScanMe is. The build stage and the marketing
prototype both answer to this document. Where the prototype and this document disagree,
this document wins and the prototype is wrong.

---

## 1. The constraint everything derives from

**A permanent QR code pointing at a swappable experience.**

The code is physical — a patch, a shirt, a card, a table tent. It is printed once and
must never need reprinting. Everything else (who you are, what you ask, what you reveal,
who can reply) is server-side config the owner swaps at will.

That gives the data model its spine:

```
user -> code (permanent, printed) -> campaign (the live experience) -> responses
```

The POC already honours the important half: a permanent URL with an editable profile
behind it. This spec adds the missing half — **campaign** as the swappable layer and
**inbox** as the response store.

---

## 2. Terminology

These two are distinct and must never be conflated in UI, copy or code:

| Term | Meaning |
|---|---|
| **Mode** | The *kind of experience* a visitor gets. Private, Networking, Creator, Open DM, Event, Business. Choosing any mode is free on every plan. |
| **Plan** | What the owner *pays*: Free, Pro, Studio. The plan sets how **deep** each mode goes. |

"Creator mode on the Free plan" is a real, working configuration — one social link, poll
results private to the owner. "Creator mode on Pro" is the same mode with all socials,
live visitor-facing results and a custom theme.

There is no "Pro mode" and no "Creator plan". Three plans: **Free / Pro / Studio**.

---

## 3. Modes

A mode bundles three decisions. The third is the one most products in this space get
wrong:

1. What the visitor sees before answering
2. What the visitor is asked
3. Where the answer goes, and whether a reply channel opens

| Mode | Visitor sees | Asked | Answer goes | Use |
|---|---|---|---|---|
| **Private** | Photo, first name, bio. No links. | Rating + anonymous note | One-way. No reply possible. | Honest feedback, "rate my drip" |
| **Networking** | Full card: role, company, links, vCard | Their name + handle + "what should I remember" | Two-way exchange | Conferences, meetups |
| **Creator** | Profile + social and shop links | Follow prompt, then one light poll | One-way; results optionally shown live to visitors | Street, drops, merch, link-in-bio IRL |
| **Open DM** | Name + a prompt | "Shoot your shot" — message + optional handle | One-way to owner; **owner** decides whether to open a thread | Social, nightlife. Highest safety cost. |
| **Event / Host** | Event branding, not a person | Rate the night, best set, suggest a track | Shared inbox across seats | Bars, galleries, weddings, pop-ups |
| **Business** | Business name + logo | NPS / stars / free text | Owner inbox, exportable, webhook | Table cards, vans, retail, barbers |
| **Portfolio** | Work samples + role | Structured feedback on a project, or a collaboration enquiry | Owner inbox, tagged by project | Designers, photographers, architects at shows and studios |
| **Recruiting** | Role and company branding | Name + contact + "what are you looking for" | Shared inbox with assignment, ATS webhook | Career fairs, hiring events, shop-window hiring |

**Portfolio and Recruiting are Studio-depth variants** — Portfolio of Creator,
Recruiting of Business. They appear as their own entries in the mode picker because that
is how people go looking for them, but on Free and Pro they run as the shallower parent
behaviour. Their full behaviour is Studio. Eight modes in the picker, six distinct
engines underneath.

**Private mode is already built.** The POC's visitor page *is* Private mode. It is the
v1 anchor, not new work.

**Open DM ships only with the full section 8 safety set.** Block, report, keyword
filtering, per-IP rate limiting, kill switch and the under-18 policy are launch blockers
for this mode specifically.

### Mode is a preset, not a cage

Selecting a mode sets visitor-reveal defaults, a suggested question deck and the reply
policy. Every one of those remains editable afterwards. The mode exists so onboarding is
one tap instead of fourteen decisions.

---

## 4. Question blocks

A campaign is a mode plus an ordered deck of blocks rendered on **one screen**.

| Block | Shape | Status |
|---|---|---|
| **Scale** | 1–10 slider, 1–5 stars, or NPS 0–10 | Built — `poll_type: 'slider'` |
| **Choice** | Single or multi, 2–6 options | Built — `poll_type: 'multiple_choice'` |
| **Open text** | Short note, character-capped | Built — `poll_type: 'open_text'` |
| **Yes/No** | One tap | New. Highest completion rate of any block. |
| **Emoji react** | One tap, no typing | New. For scans that are not surveys. |
| **Contact** | Name / email / phone / handle, each toggleable and optionally required | New. Requires the consent block alongside it. |
| **Image A/B** | Two photos, "which one?" | New. Pro only. Strongest block for outfits and drops. |
| **Link out** | Not a question — a button (follow, buy, book, menu) | New |
| **Consent** | "Add me to your list" checkbox | New. Required before any email or phone capture. |

### The honesty rule

**Every block added costs responses.** The campaign builder displays a live estimated
completion rate as blocks are added, and warns past three. This is a product feature, not
a nag: it directly protects the metric in section 6.

---

## 5. Flows

### 5.1 Visitor flow

```
scan -> /t/{code} -> resolve code -> load live campaign -> render one screen
     -> submit -> mode-specific payoff screen
```

Requirements:

- **No login, no account, ever.** A visitor asked to sign up is a lost response.
- Sub-second first paint on 4G. See 9.3 — the code-to-campaign payload is edge-cached and
  the visitor's first paint never waits on the database.
- Keep the POC's fire-and-forget scan insert; it must not block render.
- Reveal order is mode-dependent: Private asks first, Networking shows the card first.
- Payoff screen is mode-dependent: owner's links (Creator), their vCard (Networking),
  live poll results (Creator on Pro), nothing at all (Private).
- **Repeat scans are a per-mode policy** — `once_only`, `once_per_day`, or `always_open`.
  The POC's hard `localStorage` block is correct for Private and wrong for Networking.

### 5.2 Owner first run

Target: **under 90 seconds from signup to a live code.** Instrumented as the onboarding
metric.

1. Sign up (magic link or OAuth)
2. **Claim or create a code** — "I bought a patch" (enter the printed code) or "give me one"
3. **Pick a mode** — the fork that sets every default
4. Accept or swap two suggested questions from that mode's deck
5. Photo + name (skippable in some modes)
6. **Scan your own code** to preview as a visitor — the step that creates belief
7. Go live

### 5.3 Owner workspace

Navigation: **Inbox · Campaigns · Insights · Code · Profile · Shop**

**Inbox** — the home screen, and where retention lives. One card per response: who (or
Anonymous), when, which campaign, the answers. Actions: reply (where the mode and plan
allow), save contact, tag, archive, flag, block, delete. Filters by campaign, mode and
unread. Behaves like a messages app, with a push notification per response. The POC's
Responses tab is the seed of this.

**Campaigns** — saved experiences with status Live / Draft / Scheduled / Ended.
**Exactly one campaign is live per code.** That single constraint is what makes the model
comprehensible to a non-technical owner, and it means "what is on my shirt right now"
always has one answer. New Campaign leads to the mode picker, then the question picker,
then publish or schedule. Past campaigns can be duplicated. Each shows its response count.

**Insights** — scans, response rate, peak hours, repeat scanners, top answers, and
campaign-versus-campaign comparison.

**Code** — the permanent QR; PNG / SVG / PDF print sheet; short link; NFC option; a
reference showing what is physically printed; and plain reassurance that swapping
campaigns never changes the code. Multiple codes on paid plans.

**Profile** — identity and links, shared across all campaigns.

**Shop** — section 7.3. Ordering is downstream of owning a code, so every product prints
the exact QR already in use.

---

## 6. The metric

**Scan-to-response conversion.**

Not scan count. Scans measure how interesting the owner's shirt is; conversion measures
whether their *question* is any good, and that is the only one of the two the product can
improve. It is the headline number on Insights and the engine behind in-app suggestions.

---

## 7. Commercial model

Four reinforcing revenue lines: **hardware buys the user, subscription keeps them, merch
monetises the ones who love it, and the theme marketplace lets the community monetise
each other while driving Pro upgrades.**

### 7.1 Plan limits

| | **Free — £0** | **Pro — £9/mo (£7 annual)** | **Studio — £29/mo** |
|---|---|---|---|
| Codes (distinct printed QRs) | 1 | 3 | 25 |
| Live campaigns | 1 | 3 | 25 |
| Saved campaigns | 3 | unlimited | unlimited |
| Question blocks per campaign | 2 | 5 | 5 |
| Response history | 30 days | unlimited | unlimited |
| Responses per month | unlimited | unlimited | unlimited |
| Social links on profile | 1 | unlimited | unlimited |
| Themes | 1 default | all built-in + custom colours | all + full white-label |
| Apply marketplace themes | no | yes | yes (white-label supersedes) |
| List and sell themes | no | yes | yes |
| ScanMe badge on visitor page | shown | removable | removed + custom domain |
| Custom slug | — | `scan.me/tito` | custom domain |
| **Reply to a response** | **no** | yes | yes + assignment |
| CSV export | no | yes | yes + API and webhooks |
| Scheduling / auto-expire | no | yes | yes |
| Image A/B block | no | yes | yes |
| Seats | 1 | 1 | 3 |
| Notifications | per response | + weekly digest | + digest + routing |
| Safety controls (block, report, kill switch) | yes | yes | yes |

Two rules that override any later pressure to change this table:

1. **Never cap monthly responses.** Capping volume punishes the owner for virality, which
   is the exact outcome the product exists to produce.
2. **Never gate safety.** Block, report and the kill switch are free on every tier.

The five levers that actually drive upgrades, in order: response history, number of
codes, the reply channel, branding removal, social-link count.

### 7.2 Mode depth by plan

Every mode is free to try and free to run small. Payment buys more codes, longer memory,
more links, your own look, or the ability to reply.

**Private**
- Free — rating + note, anonymous only, 30-day history
- Pro — unlimited history, tags, sentiment grouping, scheduled question rotation, reply where a handle was left
- Studio — not a team mode

**Networking**
- Free — name + 1 social link; visitor leaves name + 1 handle; no vCard, no contact export
- Pro — full card (role, company, website, all socials), vCard download, "where we met" auto-tag, contact CSV export, mutual-exchange gate (their handle unlocks yours)
- Studio — shared team contact pool, CRM webhook (HubSpot / Sheets), a code per event

**Creator**
- Free — 1 social link, poll results private to the owner
- Pro — all socials (Instagram, TikTok, YouTube, Spotify, shop), link ordering and click analytics, live poll results shown to visitors, custom theme, custom slug, email and phone capture with consent block
- Studio — white-label, a code per drop, API access

**Open DM**
- Free — receive messages, 30-day history, no reply
- Pro — reply threads, keyword blocklist, auto-filter, "only people who leave a handle", pause and resume schedule
- Studio — not a team mode

**Event / Host**
- Free — 1 code, basic rating, 30-day history
- Pro — 3 codes (zones or tables), scheduling, auto-expire after the event
- Studio — 25 codes, bulk generation, shared inbox with assignment, per-code analytics, white-label, custom domain
- **Event pass — £15 for 7 days of Studio-level Event mode.** Nobody subscribes for one wedding.

**Business**
- Free — 1 code, stars + note, 30-day history. Enough for a sole trader to try.
- Pro — unlimited history, export, badge removal, 3 codes
- Studio — review routing (4–5 stars to a public review link, 1–3 stars to the private inbox), Slack and Sheets webhooks, seats, white-label, custom domain, DPA

**Portfolio** (Studio-depth variant of Creator)
- Free — runs as Creator on Free: 1 social link, no work section
- Pro — a work section (up to 6 pieces), structured feedback blocks, collaboration enquiries land as contacts
- Studio — per-project codes, feedback tagged by project, shared inbox for a studio, white-label, API

**Recruiting** (Studio-depth variant of Business)
- Free — runs as Business on Free: stars + note, 30-day history
- Pro — contact capture with consent, role description, unlimited history, export
- Studio — shared inbox with assignment, ATS webhook, per-event codes, bulk generation for a careers fair, white-label, custom domain, DPA

### 7.3 Hardware and merchandise

Print-on-demand for v1: zero inventory, lower margin, correct trade-off. Apparel through
a POD partner; patches and cards through a UK print partner.

| SKU | Indicative price | Note |
|---|---|---|
| Fabric patch (sew or iron-on) | £15 | **Includes 3 months of Pro.** The acquisition engine. |
| Iron-on transfer pack of 3 | £12 | Same code across three garments |
| T-shirt with their QR printed | £28 | |
| Overshirt / hoodie | £45 | |
| Custom cards (QR + name), 50 | £20 | Business-card replacement |
| NFC tag / sticker | £8 | Tap as well as scan |
| Event table cards, 10-pack | £18 | Pairs with the Event pass |
| Conference lanyard + badge | £10 | |
| Sticker sheet | £6 | Cheapest entry point |

Two mechanics to build, not just list:

- **An order requires an existing code.** The shop prints the exact QR already in use and
  offers "lock this design", making the printed code permanently theirs.
- **Gift a patch.** Buy one for someone else; they claim the code; the buyer gets a month
  of Pro. The strongest organic loop available to this product.

### 7.4 Theme marketplace

A two-sided revenue line running alongside merch from the start. Creators build themes
and list them; owners buy and apply them to their visitor page.

- **Split: 70% creator, 30% platform.** Seventy is what attracts supply.
- Price band £3–£12 per theme. A one-off purchase, not a subscription.
- **Listing a theme requires Pro.** Selling is a creator feature and it keeps the supply
  side accountable to a paid account.
- **Applying a purchased theme requires Pro**, because Free has one default theme (7.1).
  This makes the marketplace a Pro upgrade driver rather than a Free giveaway.
- Payouts through Stripe Connect. Studio's white-label supersedes themes entirely.
- Curation: themes are reviewed before listing. A marketplace of 40 good themes beats one
  of 400 unreviewed ones, and review is also the moderation gate.

#### Security constraint — non-negotiable

**A theme is a constrained set of design tokens, never code.** Colours, font choice,
radius, spacing and a layout preset, validated against a schema and resolved server-side
into the visitor page.

A theme must never carry raw CSS, HTML or JavaScript. The visitor page collects names,
free-text messages and sometimes email addresses; letting a third-party seller inject
markup or script into it is a stored XSS vector against every visitor of every buyer.
Themes are data. They are validated on upload, and anything outside the token schema is
rejected rather than sanitised.

### 7.5 Positioning

Free proves it. Pro is for someone whose context changes often — outfits, events, drops.
Studio is for someone running a place or a team. The patch is how all three are met, and
the theme marketplace is how the people who stay make the product bigger than you can.

---

## 8. Safety

A wearable QR that strangers scan is a harassment surface. These are designed in, not
bolted on, and none of them is gated behind a plan.

- Per-IP and per-code rate limiting on submissions — `lib/rate-limiter.ts` already does this
- Keyword and threat filtering, with owner-adjustable strictness
- Block a device hash; report a response
- A visitor is never shown anything about other visitors unless the mode explicitly says so
- **Kill switch** — one tap takes a code offline instantly, everywhere, with no reprint
- No location collection, ever
- Under-18 accounts cannot enable Open DM
- Visitor privacy notice on the scan page
- Consent block required before any email or phone capture
- Retention limits that map onto plan tiers (convenient as much as commercial)

---

## 9. Stack

Supabase is replaced by Neon. The free Supabase project allowance is exhausted, and the
replacement set below is free at this stage.

### 9.1 The three gaps and what fills them

| Supabase piece | Replacement | Cost |
|---|---|---|
| Postgres | **Neon** | Free |
| Auth | **Neon's managed Better Auth** (or self-hosted Better Auth / Auth.js on the same Neon database) | Free to ~60k MAU |
| Storage (`avatars` bucket) | **Cloudflare R2** — 10 GB/month, zero egress fees | Free |

Neon's free plan covers more of the gap than expected. It bundles managed Better Auth
(email and password, OAuth, magic links, OTP) up to roughly 60,000 monthly active users,
and **Neon RLS** via the `pg_session_jwt` extension validates the auth provider's JWT and
exposes the user identity to Postgres, so policies can call `auth.user_id()` directly.
That satisfies the project's Row Level Security rule without a duplicate identity table.

Note: Neon RLS and the Neon Data API are mutually exclusive. Choose RLS.

R2 is the right fit for the storage slot: avatars and campaign images are read far more
often than written, and R2 charges nothing for egress. Watch Class A (write) operations
rather than bandwidth.

### 9.2 Verify before sizing

Free-tier figures move. At time of writing Neon's free plan is roughly 0.5–1 GB storage
per project (sources disagree) and around 100 compute-unit-hours per project per month,
with scale-to-zero. **Confirm against the live pricing page before any capacity decision.**

Reference: [Neon free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas) ·
[Neon pricing](https://neon.com/pricing) · [Neon RLS](https://neon.com/docs/guides/neon-rls) ·
[Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)

### 9.3 Two non-optional design consequences

1. **Images never live in Postgres.** Against a 0.5–1 GB ceiling, avatars in the database
   would exhaust it almost immediately. Photos go to R2 and Postgres stores URLs. Text
   responses are roughly 300 bytes each, so the database side stays comfortable for
   millions of them.
2. **Scale-to-zero versus the sub-second scan.** Neon's free plan suspends idle compute,
   and the first query after a pause can take hundreds of milliseconds to several seconds.
   That is fatal for someone who has just scanned a shirt. The code-to-campaign payload is
   therefore **edge-cached** (Cloudflare KV, or the Next.js cache keyed by code) and
   invalidated on publish, so the visitor's first paint never waits on the database.
   Writes may absorb the cold start, since the scan insert is already fire-and-forget.

### 9.4 Fallbacks if Neon does not hold

- **Cloudflare D1** — SQLite, generous free tier, no cold-start problem, same runtime as
  the existing deploy target. The serious alternative; the cost is losing Postgres.
- **Turso** — libSQL, generous free tier, edge replicas.
- **Railway or Render Postgres** — roughly £4–6/month for always-on, which removes the
  cold-start problem entirely.

---

## 10. Gap between this spec and the current codebase

| Area | Current | Required |
|---|---|---|
| Tenancy | One `profiles` row | `users`, `codes`, `campaigns`, `question_blocks`, `responses`, `orders` — all user-scoped |
| Auth | One `ADMIN_PASSWORD` env var, obscured admin route | Neon-managed Better Auth, real sessions |
| Authorisation | Service-role key everywhere, RLS not configured | Neon RLS on every table via `auth.user_id()` |
| Database client | `lib/supabase/*` | Neon + a typed query layer (Drizzle) |
| Storage | Supabase Storage `avatars` bucket | Cloudflare R2 |
| Routing | `/` is the single visitor page | `/t/[code]` resolves code to the live campaign |
| Questions | Three fixed `poll_type` values | Ordered block list per campaign |
| Plan limits | None | Server-side enforcement on every gated row in 7.1 |
| Billing | None | Stripe subscriptions, one-off SKUs, event pass |
| Shop | None | POD integration, code claiming, order records |

**Reusable close to as-is:** HMAC session tokens (`lib/session-token.ts`), rate limiting
(`lib/rate-limiter.ts`), the security middleware (`middleware.ts`), IP hashing, test mode,
QR generation (`components/tabs/QRCodeTab.tsx`), and the scan and response insert pattern.

**This is a multi-tenant rebuild on the same framework, not a feature addition.** Recording
that here is cheaper than discovering it mid-build.

### 10.1 Data model sketch

Indicative only — full DDL, indexes and RLS policies belong to the architecture stage.

```
users            id, email, plan, plan_expires_at, dob_verified, created_at
codes            id, user_id, slug (printed, immutable), label, is_live, created_at
campaigns        id, user_id, code_id, mode, name, status, theme,
                 repeat_policy, starts_at, ends_at, created_at
question_blocks  id, campaign_id, type, position, config (jsonb), required
responses        id, campaign_id, code_id, session_token, answers (jsonb),
                 contact (jsonb), device_hash, flagged, blocked, submitted_at
replies          id, response_id, user_id, body, sent_at
scans            id, code_id, session_token, ip_hash, scanned_at
orders           id, user_id, code_id, sku, status, grants_plan, created_at
themes           id, author_id, name, tokens (jsonb), price, status, reviewed_at
theme_purchases  id, buyer_id, theme_id, amount, platform_fee, purchased_at
payouts          id, author_id, amount, period, status, paid_at
```

`themes.tokens` is schema-validated on write (7.4). A campaign references a theme by id;
the visitor page resolves tokens server-side and never renders seller-supplied markup.

Authorisation rule: `user_id` is always derived from the session, never from the request
body. Every owner-facing query is scoped by it, and RLS enforces the same scoping at the
database.

---

## 11. Open decisions

1. **Code supply** — pre-printed patches with claim codes, or owner-generated codes only?
   Determines whether print inventory and the database have to stay in agreement.
2. **Event pass versus Studio seats** — does the £15 pass include seats, or one operator?
3. **Under-18 policy** — age attestation at signup, or Open DM off by default for every
   account until explicitly enabled?
4. **Theme marketplace split** — 70/30 is assumed in 7.4. Confirm before any creator is
   invited, because it cannot be revised downward later without losing supply.
5. **Can a Free account buy a single theme** as an à-la-carte upsell, or is applying any
   theme strictly Pro? The second is simpler and a stronger upgrade lever; the first
   converts people who will never subscribe.
6. **Portfolio and Recruiting on Free** — do they appear in the picker running as their
   shallower parent (as specced in 7.2), or are they hidden until Pro? Showing them
   advertises Pro; hiding them keeps the picker honest about what you actually get.
