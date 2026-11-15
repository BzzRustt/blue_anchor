import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { schema, withOwnerDb } from '@/lib/db'
import { parseModeConfig, type ModeKey, type OwnerProfile } from '@/lib/modes'
import { personalCodeIds } from '@/lib/product'
import type { Plan } from '@/lib/plans'

/** Everything the Mode editor, Modes list and preview need for one user and one Mode. */
export async function getModeState(userId: string, mode: ModeKey) {
  return withOwnerDb(userId, async (db) => {
    const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    const [campaign] = await db.select().from(schema.campaigns)
      .where(and(eq(schema.campaigns.userId, userId), eq(schema.campaigns.mode, mode), inArray(schema.campaigns.codeId, personalCodeIds(userId))))
      .orderBy(desc(schema.campaigns.createdAt)).limit(1)
    const blocks = campaign ? await db.select().from(schema.questionBlocks).where(eq(schema.questionBlocks.campaignId, campaign.id)).orderBy(asc(schema.questionBlocks.position)) : []
    const [code] = await db.select({ id: schema.codes.id, slug: schema.codes.slug, isLive: schema.codes.isLive }).from(schema.codes)
      .where(and(eq(schema.codes.userId, userId), eq(schema.codes.kind, 'personal'))).limit(1)
    const owner: OwnerProfile = {
      name: me.name, image: me.image, bio: me.bio, role: me.role, company: me.company, instagram: me.instagram, linkedin: me.linkedin,
      tiktok: me.tiktok, youtube: me.youtube, spotify: me.spotify, website: me.website, portfolioUrl: me.portfolioUrl,
      interests: me.interests, lookingFor: me.lookingFor, canOffer: me.canOffer,
    }
    return { plan: me.plan as Plan, owner, campaign: campaign ?? null, blocks, code, config: parseModeConfig(mode, campaign?.config), active: campaign?.status === 'live' }
  })
}
