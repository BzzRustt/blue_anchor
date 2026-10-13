import crypto from 'node:crypto'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

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

function createSlug(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 22) || 'hello'
  return `${base}-${crypto.randomBytes(3).toString('hex')}`
}

export async function ensureOwnerSetup(userId: string, name: string) {
  const [existingCode] = await db.select().from(schema.codes).where(eq(schema.codes.userId, userId)).limit(1)
  let code = existingCode

  if (!code) {
    ;[code] = await db.insert(schema.codes).values({
      userId,
      slug: createSlug(name),
      label: 'My ScanMe',
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
}

export async function getVisitorExperience(slug: string): Promise<VisitorExperience | null> {
  const [result] = await db
    .select({ code: schema.codes, campaign: schema.campaigns, owner: schema.users })
    .from(schema.codes)
    .innerJoin(schema.campaigns, and(eq(schema.campaigns.codeId, schema.codes.id), eq(schema.campaigns.status, 'live')))
    .innerJoin(schema.users, eq(schema.users.id, schema.codes.userId))
    .where(and(eq(schema.codes.slug, slug), eq(schema.codes.isLive, true)))
    .limit(1)

  if (!result) return null

  const blocks = await db.select().from(schema.questionBlocks).where(eq(schema.questionBlocks.campaignId, result.campaign.id)).orderBy(asc(schema.questionBlocks.position))

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

export async function ownerSummary(userId: string) {
  const [responseCount, scanCount, unreadCount] = await Promise.all([
    db.select({ value: sql<number>`count(*)::int` }).from(schema.responses).where(eq(schema.responses.userId, userId)),
    db.select({ value: sql<number>`count(*)::int` }).from(schema.scans).innerJoin(schema.codes, eq(schema.codes.id, schema.scans.codeId)).where(eq(schema.codes.userId, userId)),
    db.select({ value: sql<number>`count(*)::int` }).from(schema.responses).where(and(eq(schema.responses.userId, userId), sql`${schema.responses.readAt} is null`)),
  ])

  const responses = responseCount[0]?.value ?? 0
  const scans = scanCount[0]?.value ?? 0
  return { responses, scans, unread: unreadCount[0]?.value ?? 0, conversion: scans > 0 ? Math.round((responses / scans) * 100) : 0 }
}

export function answerText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(answerText).join(', ')
  return ''
}
