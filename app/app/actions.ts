'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { auth } from '@/lib/auth-server'
import { headers } from 'next/headers'
import { schema, withOwnerDb } from '@/lib/db'
import { canGoLive, canSaveCampaign, type Mode, type Plan } from '@/lib/plans'

async function owner() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')
  return session.user
}

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  image: z.string().trim().url().max(500).optional().or(z.literal('')),
  handle: z.string().trim().max(40).optional(),
  role: z.string().trim().max(80).optional(),
  company: z.string().trim().max(80).optional(),
  bio: z.string().trim().max(240).optional(),
  instagram: z.string().trim().max(120).optional(),
  linkedin: z.string().trim().max(200).optional(),
  website: z.string().trim().max(200).optional(),
})

export async function saveProfile(formData: FormData) {
  const user = await owner()
  const parsed = profileSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return
  const emptyToNull = (value?: string) => value || null
  await withOwnerDb(user.id, (db) => db.update(schema.users).set({
      name: parsed.data.name,
      image: emptyToNull(parsed.data.image),
      handle: emptyToNull(parsed.data.handle),
      role: emptyToNull(parsed.data.role),
      company: emptyToNull(parsed.data.company),
      bio: emptyToNull(parsed.data.bio),
      instagram: emptyToNull(parsed.data.instagram),
      linkedin: emptyToNull(parsed.data.linkedin),
      website: emptyToNull(parsed.data.website),
      updatedAt: new Date(),
    }).where(eq(schema.users.id, user.id)))
  revalidatePath('/app/profile')
  revalidatePath('/t', 'layout')
}

const createCampaignSchema = z.object({
  name: z.string().trim().min(2).max(80),
  mode: z.enum(['private', 'networking', 'creator', 'open_dm', 'event', 'business', 'portfolio', 'recruiting']),
  question: z.string().trim().min(3).max(180),
  messagePrompt: z.string().trim().max(180).optional(),
})

export async function createCampaign(formData: FormData) {
  const user = await owner()
  const parsed = createCampaignSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return
  const created = await withOwnerDb(user.id, async (db) => {
    const [ownerRow] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1)
    const [code] = await db.select().from(schema.codes).where(eq(schema.codes.userId, user.id)).limit(1)
    const existing = await db.select({ id: schema.campaigns.id }).from(schema.campaigns).where(eq(schema.campaigns.userId, user.id))
    const gate = canSaveCampaign((ownerRow?.plan ?? 'free') as Plan, existing.length)
    if (!gate.ok || !code) return false

    const [campaign] = await db.insert(schema.campaigns).values({ userId: user.id, codeId: code.id, name: parsed.data.name, mode: parsed.data.mode as Mode, status: 'draft', repeatPolicy: parsed.data.mode === 'private' ? 'once_only' : 'always_open' }).returning()
    await db.insert(schema.questionBlocks).values([
      { campaignId: campaign.id, type: 'scale', position: 0, required: true, config: { prompt: parsed.data.question, min: 1, max: 10 } },
      { campaignId: campaign.id, type: 'open_text', position: 1, required: false, config: { prompt: parsed.data.messagePrompt || 'Do you have a message for me?', placeholder: 'Write a short message' } },
    ])
    return true
  })
  if (!created) redirect('/app/campaigns?limit=1')
  revalidatePath('/app/campaigns')
  redirect('/app/campaigns')
}

export async function publishCampaign(formData: FormData) {
  const user = await owner()
  const campaignId = String(formData.get('campaignId') ?? '')
  const published = await withOwnerDb(user.id, async (db) => {
    const [target] = await db.select().from(schema.campaigns).where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.userId, user.id))).limit(1)
    if (!target) return false
    const [ownerRow] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1)
    const live = await db.select({ id: schema.campaigns.id }).from(schema.campaigns).where(and(eq(schema.campaigns.userId, user.id), eq(schema.campaigns.status, 'live')))
    const liveWithoutTarget = live.filter((item) => item.id !== target.id).length
    const gate = canGoLive((ownerRow?.plan ?? 'free') as Plan, liveWithoutTarget)
    if (!gate.ok) return false
    await db.update(schema.campaigns).set({ status: 'ended', updatedAt: new Date() }).where(and(eq(schema.campaigns.codeId, target.codeId), eq(schema.campaigns.status, 'live')))
    await db.update(schema.campaigns).set({ status: 'live', updatedAt: new Date() }).where(and(eq(schema.campaigns.id, target.id), eq(schema.campaigns.userId, user.id)))
    return true
  })
  if (!published) return
  revalidatePath('/app/campaigns')
  revalidatePath('/t', 'layout')
}

export async function toggleCode(formData: FormData) {
  const user = await owner()
  const codeId = String(formData.get('codeId') ?? '')
  const enabled = String(formData.get('enabled')) === 'true'
  await withOwnerDb(user.id, (db) => db.update(schema.codes).set({ isLive: enabled }).where(and(eq(schema.codes.id, codeId), eq(schema.codes.userId, user.id))))
  revalidatePath('/app/code')
}

export async function archiveResponse(formData: FormData) {
  const user = await owner()
  const responseId = String(formData.get('responseId') ?? '')
  await withOwnerDb(user.id, (db) => db.update(schema.responses).set({ archived: true, readAt: new Date() }).where(and(eq(schema.responses.id, responseId), eq(schema.responses.userId, user.id))))
  revalidatePath('/app/inbox')
}
