'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth-server'
import { schema, withOwnerDb } from '@/lib/db'
import { ALLOWED_SHOW, buildBlocks, defaultConfig, isModeKey, MODE_INFO, parseModeConfig, type ModeConfig, type ModeKey } from '@/lib/modes'
import { canActivateMode, type Plan } from '@/lib/plans'
import { personalCodeIds } from '@/lib/product'

async function owner() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')
  return session.user
}

const text = (form: FormData, key: string) => String(form.get(key) ?? '')
const lines = (form: FormData, key: string) => text(form, key).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

/** Reads the editor form into a raw config; parseModeConfig then bounds and sanitises everything. */
function readConfig(mode: ModeKey, form: FormData) {
  const show = Object.fromEntries(ALLOWED_SHOW[mode].map((field) => [field, form.has(`show_${field}`)]))
  return {
    show,
    question: { on: form.has('question_on'), type: text(form, 'question_type'), prompt: text(form, 'question_prompt'), options: lines(form, 'question_options'), max: Number(text(form, 'question_max')) },
    message: { on: form.has('message_on'), prompt: text(form, 'message_prompt'), required: form.has('message_required') },
    creator: {
      featured: { title: text(form, 'featured_title'), description: text(form, 'featured_description'), url: text(form, 'featured_url'), imageUrl: text(form, 'featured_image'), button: text(form, 'featured_button') },
      links: [1, 2, 3].map((n) => ({ label: text(form, `link${n}_label`), url: text(form, `link${n}_url`) })),
      poll: { on: form.has('poll_on'), prompt: text(form, 'poll_prompt'), options: lines(form, 'poll_options') },
      collab: form.has('collab_on'),
    },
    portfolio: {
      style: text(form, 'pf_style'), intro: text(form, 'pf_intro'), enquiry: form.has('pf_enquiry'),
      projects: [1, 2, 3].map((n) => ({ title: text(form, `project${n}_title`), description: text(form, `project${n}_description`), url: text(form, `project${n}_url`), imageUrl: text(form, `project${n}_image`) })),
    },
  }
}

/** Creates or updates this user's single campaign row for the Mode, and rebuilds its questions from the config. */
async function writeMode(userId: string, mode: ModeKey, config: ModeConfig, activate: boolean): Promise<'ok' | 'pro' | 'nocode'> {
  return withOwnerDb(userId, async (db) => {
    const [me] = await db.select({ plan: schema.users.plan }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    if (!canActivateMode((me?.plan ?? 'free') as Plan, mode).ok) return 'pro'
    const [code] = await db.select().from(schema.codes).where(and(eq(schema.codes.userId, userId), eq(schema.codes.kind, 'personal'))).limit(1)
    if (!code) return 'nocode'
    const [existing] = await db.select().from(schema.campaigns).where(and(eq(schema.campaigns.userId, userId), eq(schema.campaigns.mode, mode), inArray(schema.campaigns.codeId, personalCodeIds(userId)))).limit(1)
    let campaignId = existing?.id
    if (existing) {
      await db.update(schema.campaigns).set({ config, name: MODE_INFO[mode].name, updatedAt: new Date() }).where(eq(schema.campaigns.id, existing.id))
    } else {
      const [created] = await db.insert(schema.campaigns).values({ userId, codeId: code.id, mode, name: MODE_INFO[mode].name, status: 'draft', repeatPolicy: 'always_open', config }).returning({ id: schema.campaigns.id })
      campaignId = created.id
    }
    await db.delete(schema.questionBlocks).where(eq(schema.questionBlocks.campaignId, campaignId))
    const blocks = buildBlocks(mode, config)
    if (blocks.length) await db.insert(schema.questionBlocks).values(blocks.map((block, position) => ({ campaignId, position, ...block })))
    if (activate) {
      // One live Mode per code. Deliberately does NOT touch codes.is_live: switching a Mode must
      // never turn paused sharing back on (spec 9.4).
      await db.update(schema.campaigns).set({ status: 'ended', updatedAt: new Date() }).where(and(eq(schema.campaigns.codeId, code.id), eq(schema.campaigns.status, 'live')))
      await db.update(schema.campaigns).set({ status: 'live', updatedAt: new Date() }).where(eq(schema.campaigns.id, campaignId))
    }
    return 'ok'
  })
}

export async function saveMode(formData: FormData) {
  const user = await owner()
  const mode = text(formData, 'mode')
  if (!isModeKey(mode)) return
  const result = await writeMode(user.id, mode, parseModeConfig(mode, readConfig(mode, formData)), false)
  revalidatePath('/app', 'layout')
  revalidatePath('/t', 'layout')
  redirect(`/app/modes/${mode}?${result === 'ok' ? 'saved=1' : 'locked=1'}`)
}

export async function activateMode(formData: FormData) {
  const user = await owner()
  const mode = text(formData, 'mode')
  if (!isModeKey(mode)) return
  // Activating keeps the saved settings. If the Mode has never been customised, start from its defaults.
  const [saved] = await withOwnerDb(user.id, (db) => db.select({ config: schema.campaigns.config }).from(schema.campaigns).where(and(eq(schema.campaigns.userId, user.id), eq(schema.campaigns.mode, mode), inArray(schema.campaigns.codeId, personalCodeIds(user.id)))).limit(1))
  const config = saved ? parseModeConfig(mode, saved.config) : defaultConfig(mode)
  const result = await writeMode(user.id, mode, config, true)
  revalidatePath('/app', 'layout')
  revalidatePath('/t', 'layout')
  redirect(`/app/modes/${mode}?${result === 'ok' ? 'activated=1' : 'locked=1'}`)
}
