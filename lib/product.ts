import { cache } from 'react'
import { shortCode } from '@/lib/profile-rules'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { schema, visitorDb, withOwnerDb } from '@/lib/db'
import { buildBlocks, defaultConfig, parseModeConfig, type ModeConfig, type ModeKey, type OwnerProfile } from '@/lib/modes'
import { planLimits } from '@/lib/plans'

export type QuestionConfig = {
  prompt: string
  min?: number
  max?: number
  options?: string[]
  placeholder?: string
}

export type VisitorExperience = {
  owner: OwnerProfile
  /** Parsed, bounded config for the live Mode (see lib/modes.ts). */
  config: ModeConfig
  code: typeof schema.codes.$inferSelect
  campaign: typeof schema.campaigns.$inferSelect
  blocks: Array<Omit<typeof schema.questionBlocks.$inferSelect, 'config'> & { config: QuestionConfig }>
}

/**
 * Subquery of a user's personal code ids. Event codes live in the same table, and every
 * personal-product query that means "my code" or "my campaigns" must exclude them — an
 * event must not consume the personal code, campaign or live-campaign quota.
 */
export const personalCodeIds = (userId: string) =>
  sql`(select id from codes where user_id = ${userId} and kind = 'personal')`

/**
 * Random, never derived from the name: the code is in the address bar of every visitor, and an
 * Incognito page must not reveal who owns it. Seven easy-to-read characters (see profile-rules.ts);
 * codes made before this keep their old form, so printed QRs never break.
 */
const createSlug = shortCode

export async function ensureOwnerSetup(userId: string, name: string) {
  return withOwnerDb(userId, async (db) => {
    // The workspace layout and the page both call this on a first visit, in parallel. Without
    // serialising them each sees "no code yet" and creates one, leaving a new user with two
    // personal codes (and over a free plan's one-code limit). The lock is per user and is
    // released when the transaction ends.
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
    const [existingCode] = await db.select().from(schema.codes).where(and(eq(schema.codes.userId, userId), eq(schema.codes.kind, 'personal'))).limit(1)
    let code = existingCode

    if (!code) {
      ;[code] = await db.insert(schema.codes).values({
        userId,
        slug: createSlug(),
        label: 'My ScanMe',
        // Spec: personal sharing starts OFF; the owner turns it on from Home after previewing.
        isLive: false,
      }).returning()
    }

    const [existingCampaign] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.codeId, code.id)).orderBy(desc(schema.campaigns.createdAt)).limit(1)
    let campaign = existingCampaign

    if (!campaign) {
      ;[campaign] = await db.insert(schema.campaigns).values({
        userId,
        codeId: code.id,
        mode: 'basic',
        name: 'Basic',
        status: 'live',
        repeatPolicy: 'always_open',
        config: defaultConfig('basic'),
      }).returning()

      await db.insert(schema.questionBlocks).values(buildBlocks('basic', defaultConfig('basic')).map((block, position) => ({ campaignId: campaign.id, position, ...block })))
    }

    return { code, campaign }
  })
}

export async function getVisitorExperience(slug: string): Promise<VisitorExperience | null> {
  const [result] = await visitorDb
    .select({
      code: schema.codes,
      campaign: schema.campaigns,
      owner: {
        name: schema.users.name,
        image: schema.users.image,
        bio: schema.users.bio,
        role: schema.users.role,
        company: schema.users.company,
        instagram: schema.users.instagram,
        linkedin: schema.users.linkedin,
        website: schema.users.website,
        tiktok: schema.users.tiktok,
        youtube: schema.users.youtube,
        spotify: schema.users.spotify,
        portfolioUrl: schema.users.portfolioUrl,
        interests: schema.users.interests,
        lookingFor: schema.users.lookingFor,
        canOffer: schema.users.canOffer,
        plan: schema.users.plan,
      },
    })
    .from(schema.codes)
    .innerJoin(schema.campaigns, and(eq(schema.campaigns.codeId, schema.codes.id), eq(schema.campaigns.status, 'live')))
    .innerJoin(schema.users, eq(schema.users.id, schema.codes.userId))
    .where(and(eq(schema.codes.slug, slug), eq(schema.codes.isLive, true)))
    .limit(1)

  if (!result) return null

  const blocks = await visitorDb.select().from(schema.questionBlocks).where(eq(schema.questionBlocks.campaignId, result.campaign.id)).orderBy(asc(schema.questionBlocks.position))

  return {
    owner: result.owner,
    config: parseModeConfig(modeKey(result.campaign.mode), result.campaign.config),
    code: result.code,
    campaign: result.campaign,
    blocks: blocks.map((block) => ({ ...block, config: block.config as QuestionConfig })),
  }
}

/** Legacy Modes (private, open_dm...) are shown as Basic; the five real Modes pass through. */
export function modeKey(mode: string): ModeKey {
  return (['basic', 'networking', 'incognito', 'creator', 'portfolio'] as const).find((key) => key === mode) ?? 'basic'
}

const LONDON_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })

/** SQL for the plan's history window: null (no limit) or the cutoff. Only the free plan is finite. */
export const historyWindowSql = (userId: string) =>
  sql`(select case when plan = 'free' then now() - make_interval(days => ${planLimits('free').historyDays}) end from users where id = ${userId})`

type SummaryRow = {
  name: string; plan: string; image: string | null; since: Date | string | null
  code: { id: string; slug: string; is_live: boolean } | null
  campaigns: Array<{ id: string; name: string; mode: string; status: string }>
  unread: number; responses: number; responses30: number; visits30: number; clicks30: number
  open: number; archived: number; blocked: number
  per_day: Record<string, number>
  live_question: string | null
}

/**
 * Everything the workspace shell and Home show, in ONE statement (each round trip to the database
 * is the main cost of a page load, so this replaced five sequential queries). Cached per request,
 * so the layout and the page share it. Personal only: event codes, scans and attendees never count
 * here (spec: "Do not mix event registration or event networking metrics into these personal
 * statistics"). `since` is the plan's history window (free: 30 days), applied to responses.
 */
export const ownerSummary = cache(async (userId: string) => withOwnerDb(userId, async (db) => {
  const pcs = personalCodeIds(userId)
  const { rows: [row] } = await db.execute<SummaryRow>(sql`
    with me as (select name, plan, image, ${historyWindowSql(userId)} as since from users where id = ${userId})
    select me.name, me.plan, me.image, me.since,
      (select json_build_object('id', c.id, 'slug', c.slug, 'is_live', c.is_live) from codes c where c.user_id = ${userId} and c.kind = 'personal' order by c.created_at limit 1) as code,
      (select coalesce(json_agg(json_build_object('id', ca.id, 'name', ca.name, 'mode', ca.mode, 'status', ca.status) order by ca.created_at desc), '[]'::json) from campaigns ca where ca.code_id in ${pcs}) as campaigns,
      (select qb.config->>'prompt' from question_blocks qb join campaigns ca on ca.id = qb.campaign_id
         where ca.code_id in ${pcs} and ca.status = 'live' order by qb.position limit 1) as live_question,
      (select count(*)::int from responses r where r.user_id = ${userId} and not r.archived and r.read_at is null and (me.since is null or r.submitted_at >= me.since)) as unread,
      (select count(*)::int from responses r where r.user_id = ${userId} and (me.since is null or r.submitted_at >= me.since)) as responses,
      (select count(*)::int from responses r where r.user_id = ${userId} and not r.archived and (me.since is null or r.submitted_at >= me.since)) as open,
      (select count(*)::int from responses r where r.user_id = ${userId} and r.archived and not r.blocked and (me.since is null or r.submitted_at >= me.since)) as archived,
      (select count(*)::int from responses r where r.user_id = ${userId} and r.blocked and (me.since is null or r.submitted_at >= me.since)) as blocked,
      (select count(*)::int from responses r where r.user_id = ${userId} and r.submitted_at >= now() - interval '30 days') as responses30,
      (select count(*)::int from scans s where s.code_id in ${pcs} and s.scanned_at >= now() - interval '30 days') as visits30,
      (select count(*)::int from link_clicks l where l.code_id in ${pcs} and l.clicked_at >= now() - interval '30 days') as clicks30,
      (select coalesce(json_object_agg(d.day, d.n), '{}'::json) from (
        select to_char(s.scanned_at at time zone 'Europe/London', 'YYYY-MM-DD') as day, count(*)::int as n
        from scans s where s.code_id in ${pcs} and s.scanned_at >= now() - interval '8 days' group by 1) d) as per_day
    from me`)
  if (!row) throw new Error('Owner row not visible')

  // Seven London calendar days ending today, labelled in London time too (the old chart
  // bucketed by UTC date but labelled in local time, so late-evening visits landed a day off).
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86_400_000)
    const key = LONDON_DAY.format(date)
    return { key, label: date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Europe/London' }), count: row.per_day[key] ?? 0 }
  })
  const code = row.code ? { id: row.code.id, slug: row.code.slug, isLive: row.code.is_live } : null
  return {
    name: row.name, plan: row.plan, image: row.image, since: row.since ? new Date(row.since) : null,
    code, campaigns: row.campaigns, active: row.campaigns.find((c) => c.status === 'live') ?? null, liveQuestion: row.live_question,
    counts: { unread: row.unread, responses: row.responses, responses30: row.responses30, visits30: row.visits30, clicks30: row.clicks30, open: row.open, archived: row.archived, blocked: row.blocked }, days,
  }
}))

export function answerText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(answerText).join(', ')
  return ''
}
