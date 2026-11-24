import { sql } from 'drizzle-orm'
import { withOwnerDb } from '@/lib/db'
import { parseModeConfig, type BlockSpec, type ModeKey, type OwnerProfile } from '@/lib/modes'
import { personalCodeIds } from '@/lib/product'
import type { Plan } from '@/lib/plans'

type Row = {
  plan: Plan
  owner: OwnerProfile
  campaign: { id: string; status: string; config: unknown } | null
  blocks: Array<{ id: string; campaignId: string; position: number; required: boolean; type: BlockSpec['type']; config: BlockSpec['config'] }>
  code: { id: string; slug: string; isLive: boolean } | null
}

/** Everything the Mode editor and preview need for one user and one Mode, in one statement. */
export async function getModeState(userId: string, mode: ModeKey) {
  const row = await withOwnerDb(userId, async (db) => (await db.execute<Row>(sql`
    with me as (select * from users where id = ${userId}),
    c as (select ca.id, ca.status, ca.config from campaigns ca
          where ca.user_id = ${userId} and ca.mode = ${mode}::mode and ca.code_id in ${personalCodeIds(userId)}
          order by ca.created_at desc limit 1)
    select me.plan,
      json_build_object('name', me.name, 'image', me.image, 'bio', me.bio, 'role', me.role, 'company', me.company,
        'instagram', me.instagram, 'linkedin', me.linkedin, 'tiktok', me.tiktok, 'youtube', me.youtube, 'spotify', me.spotify,
        'website', me.website, 'portfolioUrl', me.portfolio_url, 'interests', me.interests, 'lookingFor', me.looking_for, 'canOffer', me.can_offer) as owner,
      (select json_build_object('id', c.id, 'status', c.status, 'config', c.config) from c) as campaign,
      (select coalesce(json_agg(json_build_object('id', qb.id, 'campaignId', qb.campaign_id, 'position', qb.position, 'required', qb.required, 'type', qb.type, 'config', qb.config) order by qb.position), '[]'::json)
         from question_blocks qb where qb.campaign_id = (select id from c)) as blocks,
      (select json_build_object('id', co.id, 'slug', co.slug, 'isLive', co.is_live) from codes co
         where co.user_id = ${userId} and co.kind = 'personal' order by co.created_at limit 1) as code
    from me`)).rows[0])
  if (!row) throw new Error('Owner row not visible')
  return { plan: row.plan, owner: row.owner, campaign: row.campaign, blocks: row.blocks, code: row.code, config: parseModeConfig(mode, row.campaign?.config), active: row.campaign?.status === 'live' }
}
