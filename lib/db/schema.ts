/**
 * Database schema — docs/PRODUCT_SPEC.md section 10.1.
 *
 * Money is always an integer in minor units (pence). Never a float.
 *
 * Ownership rule: every owner-scoped table carries `userId` directly, even where it
 * could be reached through a join. RLS policies (lib/db/rls.sql) compare that column to
 * auth.user_id() per row, and a subquery per row is the difference between an index scan
 * and a disaster.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const planEnum = pgEnum('plan', ['free', 'pro', 'studio'])

/** Distinguishes a person's permanent code from an event directory's permanent code. */
export const codeKindEnum = pgEnum('code_kind', ['personal', 'event'])

/** Where an attendee record came from. Four doors, one profile. */
export const attendeeSourceEnum = pgEnum('attendee_source', [
  'native',
  'import',
  'embedded',
  'walk_up',
])

export const attendeeStatusEnum = pgEnum('attendee_status', [
  'invited',
  'complete',
  'withdrawn',
])

export const reactionKindEnum = pgEnum('reaction_kind', ['like', 'applaud'])

export const modeEnum = pgEnum('mode', [
  'basic',
  'incognito',
  'private',
  'networking',
  'creator',
  'open_dm',
  'event',
  'business',
  'portfolio',
  'recruiting',
])

export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'scheduled',
  'live',
  'ended',
])

export const blockTypeEnum = pgEnum('block_type', [
  'scale',
  'choice',
  'open_text',
  'yes_no',
  'emoji',
  'contact',
  'image_ab',
  'link_out',
  'consent',
])

/** How often one visitor may answer the same code (spec 5.1). */
export const repeatPolicyEnum = pgEnum('repeat_policy', [
  'once_only',
  'once_per_day',
  'always_open',
])

export const themeStatusEnum = pgEnum('theme_status', [
  'draft',
  'in_review',
  'listed',
  'rejected',
  'delisted',
])

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'paid',
  'fulfilled',
  'cancelled',
  'refunded',
])

export const payoutStatusEnum = pgEnum('payout_status', ['pending', 'paid', 'failed'])

/**
 * Owners. The first six columns are the shape Better Auth expects, so it can own this
 * table directly in the auth slice rather than forcing a second table and a join.
 */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name').notNull(),
  image: text('image'),
  handle: text('handle').unique(),
  bio: text('bio'),
  role: text('role'),
  company: text('company'),
  instagram: text('instagram'),
  linkedin: text('linkedin'),
  website: text('website'),
  tiktok: text('tiktok'),
  youtube: text('youtube'),
  spotify: text('spotify'),
  portfolioUrl: text('portfolio_url'),
  interests: text('interests'),
  lookingFor: text('looking_for'),
  canOffer: text('can_offer'),
  plan: planEnum('plan').notNull().default('free'),
  planExpiresAt: timestamp('plan_expires_at', { withTimezone: true }),
  /** Gates Open DM (spec section 8). Not a plan gate. */
  dobVerified: boolean('dob_verified').notNull().default(false),
  stripeCustomerId: text('stripe_customer_id'),
  /** Stripe Connect account for theme marketplace payouts. */
  stripeConnectId: text('stripe_connect_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Better Auth session storage. Auth tables are server-only and never queried by clients. */
export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)]
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_user_idx').on(t.userId)]
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)]
)

/**
 * A printed QR code. `slug` is what is physically on the patch and is never reissued —
 * the whole product rests on this being permanent (spec section 1).
 */
export const codes = pgTable(
  'codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull().unique(),
    label: text('label'),
    /**
     * A personal code belongs to one person; an event code is the permanent URL for an
     * event directory. Both are permanent slugs pointing at a swappable campaign, so they
     * share this table — but plan metering must tell them apart, because an event must not
     * bill against someone's personal code quota.
     */
    kind: codeKindEnum('kind').notNull().default('personal'),
    /** The kill switch. False takes the code offline everywhere, instantly, no reprint. */
    isLive: boolean('is_live').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('codes_user_idx').on(t.userId)]
)

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeId: uuid('code_id')
      .notNull()
      .references(() => codes.id, { onDelete: 'cascade' }),
    mode: modeEnum('mode').notNull(),
    name: text('name').notNull(),
    status: campaignStatusEnum('status').notNull().default('draft'),
    themeId: uuid('theme_id'),
    repeatPolicy: repeatPolicyEnum('repeat_policy').notNull().default('once_only'),
    /** Mode settings (what to show, featured item, projects...). See lib/modes.ts; parsed defensively on read. */
    config: jsonb('config').notNull().default({}),
    /** Creator mode on pro can show running poll results to visitors. */
    showResultsToVisitors: boolean('show_results_to_visitors').notNull().default(false),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('campaigns_user_idx').on(t.userId),
    index('campaigns_code_idx').on(t.codeId),
    /**
     * Exactly one live campaign per code — the constraint that makes the whole model
     * comprehensible (spec 5.3). Enforced here so no API path can violate it.
     */
    uniqueIndex('campaigns_one_live_per_code')
      .on(t.codeId)
      .where(sql`${t.status} = 'live'`),
  ]
)

export const questionBlocks = pgTable(
  'question_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    type: blockTypeEnum('type').notNull(),
    position: integer('position').notNull(),
    /** Block-specific settings: scale bounds, choice options, char caps, link targets. */
    config: jsonb('config').notNull().default({}),
    required: boolean('required').notNull().default(false),
  },
  (t) => [uniqueIndex('question_blocks_order').on(t.campaignId, t.position)]
)

/**
 * One visitor submission.
 *
 * `campaignId` is nullable and set null on delete: deleting a campaign must not destroy
 * inbox history an owner is paying to keep.
 */
export const responses = pgTable(
  'responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    codeId: uuid('code_id')
      .notNull()
      .references(() => codes.id, { onDelete: 'cascade' }),
    sessionToken: text('session_token').notNull(),
    /** Answers keyed by question_blocks.id. */
    answers: jsonb('answers').notNull().default({}),
    /** Name, email, phone or handle, when a contact block collected them. */
    contact: jsonb('contact'),
    /** SHA-256 of the visitor IP. The raw IP is never stored. */
    deviceHash: text('device_hash'),
    flagged: boolean('flagged').notNull().default(false),
    blocked: boolean('blocked').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Drives the inbox feed. */
    index('responses_inbox_idx').on(t.userId, t.submittedAt.desc()),
    index('responses_campaign_idx').on(t.campaignId),
  ]
)

/** Owner replies. Only reachable where the plan and mode allow a reply channel. */
export const replies = pgTable(
  'replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    responseId: uuid('response_id')
      .notNull()
      .references(() => responses.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('replies_response_idx').on(t.responseId)]
)

/** One row per page open. Written fire-and-forget so it never blocks the visitor. */
export const scans = pgTable(
  'scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codeId: uuid('code_id')
      .notNull()
      .references(() => codes.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    sessionToken: text('session_token').notNull(),
    ipHash: text('ip_hash'),
    scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('scans_code_idx').on(t.codeId, t.scannedAt.desc())]
)

/** A pay-to-publish purchase. Created pending by the organiser; marked paid only by the Stripe webhook. */
export const eventPurchases = pgTable(
  'event_purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    packageKey: text('package_key').notNull(),
    capacity: integer('capacity').notNull(),
    amountPence: integer('amount_pence').notNull(),
    currency: text('currency').notNull().default('gbp'),
    status: text('status').notNull().default('pending'),
    stripeSessionId: text('stripe_session_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('event_purchases_session_unique').on(t.stripeSessionId), index('event_purchases_event_idx').on(t.eventId)]
)

/** One row per outbound link click on a visitor page. Written by the /out redirect route only. */
export const linkClicks = pgTable(
  'link_clicks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codeId: uuid('code_id')
      .notNull()
      .references(() => codes.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    target: text('target').notNull(),
    sessionToken: text('session_token').notNull(),
    clickedAt: timestamp('clicked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('link_clicks_code_idx').on(t.codeId, t.clickedAt.desc())]
)

/** Device hashes an owner has blocked (spec section 8). Free on every plan. */
export const blockedDevices = pgTable(
  'blocked_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceHash: text('device_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('blocked_devices_unique').on(t.userId, t.deviceHash)]
)

/**
 * Marketplace themes.
 *
 * `tokens` holds design tokens only — colours, font choice, radius, spacing, layout
 * preset — validated against a schema on write (spec 7.4). A theme never carries CSS,
 * HTML or JavaScript: the visitor page collects strangers' names, messages and email
 * addresses, so seller-supplied markup there would be stored XSS against every visitor
 * of every buyer.
 */
export const themes = pgTable(
  'themes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokens: jsonb('tokens').notNull(),
    /** Pence. Zero for the built-in themes. */
    priceMinor: integer('price_minor').notNull().default(0),
    status: themeStatusEnum('status').notNull().default('draft'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('themes_listed_idx').on(t.status), index('themes_author_idx').on(t.authorId)]
)

export const themePurchases = pgTable(
  'theme_purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buyerId: text('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    themeId: uuid('theme_id')
      .notNull()
      .references(() => themes.id, { onDelete: 'restrict' }),
    amountMinor: integer('amount_minor').notNull(),
    /** The 30% platform cut, stored per sale so a later split change is not retroactive. */
    platformFeeMinor: integer('platform_fee_minor').notNull(),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('theme_purchases_once').on(t.buyerId, t.themeId)]
)

export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amountMinor: integer('amount_minor').notNull(),
    /** Billing period, e.g. "2026-10". */
    period: text('period').notNull(),
    status: payoutStatusEnum('status').notNull().default('pending'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('payouts_author_period').on(t.authorId, t.period)]
)

/** Merch orders. `codeId` is the QR that gets printed on the item (spec 7.3). */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeId: uuid('code_id').references(() => codes.id, { onDelete: 'set null' }),
    sku: text('sku').notNull(),
    quantity: integer('quantity').notNull().default(1),
    amountMinor: integer('amount_minor').notNull(),
    status: orderStatusEnum('status').notNull().default('pending'),
    /** The patch includes three months of pro; a gift grants the buyer a month. */
    grantsPlan: planEnum('grants_plan'),
    grantsMonths: integer('grants_months'),
    /** Set when the order is a gift, so the recipient claims the code. */
    giftEmail: text('gift_email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('orders_user_idx').on(t.userId)]
)

/* ───────────────────────── Events layer ─────────────────────────────────────
 *
 * Added on top of the personal product, not instead of it. An event reuses the
 * existing spine: it owns a `codes` row (kind='event') for its permanent URL, and a
 * `campaigns` row (mode='event') whose `question_blocks` are the questions every
 * attendee answers about themselves.
 *
 * The one inversion to keep in mind: in the personal product a visitor's answers are
 * private to the owner. Here an attendee's answers ARE their public card inside the
 * event. That is why attendee answers live in `eventAttendees` rather than `responses`
 * — the existing `responses_owner` policy (user_id = auth.user_id()) is right for
 * private feedback and wrong for a shared directory, and must not be rewritten.
 */

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The organiser. */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Permanent event URL. Reusable year to year; `codes.isLive` is the kill switch. */
    codeId: uuid('code_id')
      .notNull()
      .references(() => codes.id, { onDelete: 'cascade' }),
    /** Holds the event's question set via its question_blocks. */
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    venue: text('venue'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Short code on the badge and the welcome slide. Gates the directory. */
    accessCode: text('access_code').notNull(),
    /**
     * Role letters shown on badges, e.g. [{"letter":"F","label":"Founder"}, …].
     * The letter makes role legible across a room with no lookup at all.
     */
    roleSet: jsonb('role_set').notNull().default([]),
    /** When the directory goes dark for attendees. Usually endsAt + 48h. */
    directoryExpiresAt: timestamp('directory_expires_at', { withTimezone: true }).notNull(),
    /** draft -> awaiting_payment -> published | cancelled. Only 'published' is reachable by attendees. */
    status: text('status').notNull().default('published'),
    timezone: text('timezone').notNull().default('Europe/London'),
    description: text('description'),
    coverUrl: text('cover_url'),
    /** Purchased attendee capacity. Null = legacy event, capped by the organiser's plan. */
    capacity: integer('capacity'),
    discovery: text('discovery').notNull().default('badge'),
    messagingEnabled: boolean('messaging_enabled').notNull().default(false),
    networkingOpensAt: timestamp('networking_opens_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('events_user_idx').on(t.userId),
    uniqueIndex('events_code_unique').on(t.codeId),
  ]
)

/**
 * One attendee at one event.
 *
 * Deliberately NOT a `users` row until they claim an account: it keeps the auth tables
 * clean and makes expiry trivial, with no orphan accounts to collect.
 */
export const eventAttendees = pgTable(
  'event_attendees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** What is printed on the badge: "F-042", or "042" for a single-cohort event. */
    tag: text('tag').notNull(),
    /** The role half of the tag, kept separate so the directory can filter on it. */
    roleLetter: text('role_letter'),
    displayName: text('display_name').notNull(),
    /** Never exposed to the directory. visitor_user has no column grant on this. */
    email: text('email'),
    /** Answers keyed by question_blocks.id — this is the attendee's public card. */
    answers: jsonb('answers').notNull().default({}),
    /**
     * Per-field visibility, so an in-demand attendee can narrow their card. Investors
     * get approached by everyone; founders want to be found. Same product, different
     * defaults, or the scarce people disengage and take the event's draw with them.
     */
    visibility: jsonb('visibility').notNull().default({}),
    source: attendeeSourceEnum('source').notNull().default('native'),
    status: attendeeStatusEnum('status').notNull().default('invited'),
    /** Set once they claim an account; their connections then survive expiry. */
    claimedUserId: text('claimed_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Single-use token for the claim link emailed after the event. */
    claimToken: text('claim_token'),
    externalRef: text('external_ref'),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    /** hidden | name | full: what someone scanning the badge (or, later, searching) sees. */
    profileVisibility: text('profile_visibility').notNull().default('full'),
    allowMessages: boolean('allow_messages').notNull().default(true),
    notifyEmail: boolean('notify_email').notNull().default(false),
    /** Set when a spare walk-up tag is claimed by its first scan. */
    accessClaimedAt: timestamp('access_claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('event_attendees_tag_unique').on(t.eventId, t.tag),
    index('event_attendees_event_idx').on(t.eventId),
    index('event_attendees_claimed_idx').on(t.claimedUserId),
  ]
)

/** Who looked up whom. Vanity metric in the personal product; the report here. */
export const eventLookups = pgTable(
  'event_lookups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    targetAttendeeId: uuid('target_attendee_id')
      .notNull()
      .references(() => eventAttendees.id, { onDelete: 'cascade' }),
    /** Null when the viewer has not identified themselves as an attendee. */
    viewerAttendeeId: uuid('viewer_attendee_id').references(() => eventAttendees.id, {
      onDelete: 'set null',
    }),
    sessionToken: text('session_token').notNull(),
    lookedUpAt: timestamp('looked_up_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('event_lookups_report_idx').on(t.eventId, t.lookedUpAt.desc())]
)

/** One tap shares your card. No free text, so no moderation surface on day one. */
export const connectionRequests = pgTable(
  'connection_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    fromAttendeeId: uuid('from_attendee_id')
      .notNull()
      .references(() => eventAttendees.id, { onDelete: 'cascade' }),
    toAttendeeId: uuid('to_attendee_id')
      .notNull()
      .references(() => eventAttendees.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('connection_requests_once').on(t.eventId, t.fromAttendeeId, t.toAttendeeId),
    index('connection_requests_to_idx').on(t.toAttendeeId),
  ]
)

/**
 * Reactions on an attendee's card.
 *
 * Counts stay private to the recipient in v1: public counts turn the directory into a
 * popularity contest and quietly punish whoever sits at zero. They also make the better
 * claim hook — "7 people applauded your profile, claim your account to see who".
 */
export const reactions = pgTable(
  'reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** The card being reacted to. */
    attendeeId: uuid('attendee_id')
      .notNull()
      .references(() => eventAttendees.id, { onDelete: 'cascade' }),
    fromAttendeeId: uuid('from_attendee_id')
      .notNull()
      .references(() => eventAttendees.id, { onDelete: 'cascade' }),
    kind: reactionKindEnum('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reactions_once').on(t.eventId, t.attendeeId, t.fromAttendeeId, t.kind),
    index('reactions_attendee_idx').on(t.attendeeId),
  ]
)

/** Personal access links for attendees. Only the sha256 of the token is stored. */
export const attendeeAccessTokens = pgTable(
  'attendee_access_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attendeeId: uuid('attendee_id').notNull().references(() => eventAttendees.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdBy: text('created_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('attendee_access_tokens_hash_unique').on(t.tokenHash), index('attendee_access_tokens_attendee_idx').on(t.attendeeId)]
)

/** Append-only record of sensitive organiser actions (issuing access links, cancellations). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    targetId: uuid('target_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_event_idx').on(t.eventId, t.createdAt.desc())]
)

