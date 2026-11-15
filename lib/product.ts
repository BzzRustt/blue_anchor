import crypto from 'node:crypto'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { schema, visitorDb, withOwnerDb } from '@/lib/db'
import { historyCutoff } from '@/lib/plans'

export type QuestionConfig = {
  prompt: string
  min?: number
  max?: number
  options?: string[]
  placeholder?: string
}

export type VisitorExperience = {
  owner: {
    name: string
    image: string | null
    bio: string | null
    role: string | null
    company: string | null
    instagram: string | null
    linkedin: string | null
    website: string | null
  }
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

function createSlug(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 22) || 'hello'
  return `${base}-${crypto.randomBytes(3).toString('hex')}`
}

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
        slug: createSlug(name),
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
        mode: 'networking',
        name: 'First introductions',
        status: 'live',
        repeatPolicy: 'always_open',
      }).returning()

      await db.insert(schema.questionBlocks).values([
        { campaignId: campaign.id, type: 'scale', position: 0, required: true, config: { prompt: 'Rate my drip from 1 to 10', min: 1, max: 10 } },
        { campaignId: campaign.id, type: 'open_text', position: 1, required: false, config: { prompt: 'Do you have a message for me?', placeholder: 'Say something real' } },
      ])
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
    owner: {
      name: result.owner.name,
      image: result.owner.image,
      bio: result.owner.bio,
      role: result.owner.role,
      company: result.owner.company,
      instagram: result.owner.instagram,
      linkedin: result.owner.linkedin,
      website: result.owner.website,
    },
    code: result.code,
    campaign: result.campaign,
    blocks: blocks.map((block) => ({ ...block, config: block.config as QuestionConfig })),
  }
}

const LONDON_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })

/**
 * Everything the Home tab shows, personal only: event codes, scans and attendees never count
 * here (spec: "Do not mix event registration or event networking metrics into these personal
 * statistics"). `since` is the plan's history window (free: 30 days), applied to responses.
 */
export async function homeData(userId: string) {
  return withOwnerDb(userId, async (db) => {
    const [me] = await db.select({ plan: schema.users.plan }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    const plan = me?.plan ?? 'free'
    const since = historyCutoff(plan)
    const responseWindow = since ? sql`and submitted_at >= ${since}` : sql``
    const [code] = await db.select({ id: schema.codes.id, slug: schema.codes.slug, isLive: schema.codes.isLive }).from(schema.codes)
      .where(and(eq(schema.codes.userId, userId), eq(schema.codes.kind, 'personal'))).limit(1)
    const campaigns = await db.select({ id: schema.campaigns.id, name: schema.campaigns.name, mode: schema.campaigns.mode, status: schema.campaigns.status }).from(schema.campaigns)
      .where(sql`${schema.campaigns.codeId} in ${personalCodeIds(userId)}`).orderBy(desc(schema.campaigns.createdAt))
    const [counts] = await db.execute<{ unread: number; responses: number; responses30: number; visits30: number }>(sql`
      select
        (select count(*)::int from responses where user_id = ${userId} and archived = false and read_at is null ${responseWindow}) as unread,
        (select count(*)::int from responses where user_id = ${userId} ${responseWindow}) as responses,
        (select count(*)::int from responses where user_id = ${userId} and submitted_at >= now() - interval '30 days') as responses30,
        (select count(*)::int from scans where code_id in ${personalCodeIds(userId)} and scanned_at >= now() - interval '30 days') as visits30`).then((r) => r.rows)
    const perDay = await db.execute<{ day: string; n: number }>(sql`
      select to_char(scanned_at at time zone 'Europe/London', 'YYYY-MM-DD') as day, count(*)::int as n
      from scans where code_id in ${personalCodeIds(userId)} and scanned_at >= now() - interval '8 days' group by 1`).then((r) => r.rows)

    // Seven London calendar days ending today, labelled in London time too (the old chart
    // bucketed by UTC date but labelled in local time, so late-evening visits landed a day off).
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.now() - (6 - index) * 86_400_000)
      const key = LONDON_DAY.format(date)
      return { key, label: date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Europe/London' }), count: perDay.find((row) => row.day === key)?.n ?? 0 }
    })

    return { plan, since, code, campaigns, active: campaigns.find((c) => c.status === 'live') ?? null, counts, days }
  })
}

export function answerText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(answerText).join(', ')
  return ''
}
