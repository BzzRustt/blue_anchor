'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { auth } from '@/lib/auth-server'
import { headers } from 'next/headers'
import { schema, withOwnerDb } from '@/lib/db'
import { appBaseUrl } from '@/lib/event-queries'
import { createBillingPortal, createProCheckout } from '@/lib/stripe'

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
  tiktok: z.string().trim().max(120).optional(),
  youtube: z.string().trim().max(200).optional(),
  spotify: z.string().trim().max(200).optional(),
  portfolioUrl: z.string().trim().max(200).optional(),
  interests: z.string().trim().max(160).optional(),
  lookingFor: z.string().trim().max(200).optional(),
  canOffer: z.string().trim().max(200).optional(),
})

export async function saveProfile(formData: FormData) {
  const user = await owner()
  const parsed = profileSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/app/profile?error=check')
  const emptyToNull = (value?: string) => value || null
  try {
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
      tiktok: emptyToNull(parsed.data.tiktok),
      youtube: emptyToNull(parsed.data.youtube),
      spotify: emptyToNull(parsed.data.spotify),
      portfolioUrl: emptyToNull(parsed.data.portfolioUrl),
      interests: emptyToNull(parsed.data.interests),
      lookingFor: emptyToNull(parsed.data.lookingFor),
      canOffer: emptyToNull(parsed.data.canOffer),
      updatedAt: new Date(),
    }).where(eq(schema.users.id, user.id)))
  } catch (error) {
    // The handle column is unique: a taken handle used to surface as an unhandled 500.
    if (JSON.stringify(error).includes('users_handle_unique') || String(error).includes('handle')) redirect('/app/profile?error=handle')
    throw error
  }
  revalidatePath('/app', 'layout')
  revalidatePath('/t', 'layout')
  redirect('/app/profile?saved=1')
}

export async function toggleCode(formData: FormData) {
  const user = await owner()
  const codeId = String(formData.get('codeId') ?? '')
  const enabled = String(formData.get('enabled')) === 'true'
  await withOwnerDb(user.id, (db) => db.update(schema.codes).set({ isLive: enabled }).where(and(eq(schema.codes.id, codeId), eq(schema.codes.userId, user.id))))
  revalidatePath('/app', 'layout')
}

export async function markResponseRead(formData: FormData) {
  const user = await owner()
  const responseId = String(formData.get('responseId') ?? '')
  await withOwnerDb(user.id, (db) => db.update(schema.responses).set({ readAt: new Date() }).where(and(eq(schema.responses.id, responseId), eq(schema.responses.userId, user.id))))
  revalidatePath('/app', 'layout')
}

export async function archiveResponse(formData: FormData) {
  const user = await owner()
  const responseId = String(formData.get('responseId') ?? '')
  await withOwnerDb(user.id, (db) => db.update(schema.responses).set({ archived: true, readAt: new Date() }).where(and(eq(schema.responses.id, responseId), eq(schema.responses.userId, user.id))))
  revalidatePath('/app', 'layout')
}

/** Stops further responses from the sender's device/network (spec: blocking is free on every plan). */
export async function blockSender(formData: FormData) {
  const user = await owner()
  const responseId = String(formData.get('responseId') ?? '')
  await withOwnerDb(user.id, async (db) => {
    const [response] = await db.select({ deviceHash: schema.responses.deviceHash }).from(schema.responses).where(and(eq(schema.responses.id, responseId), eq(schema.responses.userId, user.id))).limit(1)
    if (!response?.deviceHash) return
    await db.insert(schema.blockedDevices).values({ userId: user.id, deviceHash: response.deviceHash }).onConflictDoNothing()
    await db.update(schema.responses).set({ blocked: true, archived: true, readAt: new Date() }).where(and(eq(schema.responses.id, responseId), eq(schema.responses.userId, user.id)))
  })
  revalidatePath('/app', 'layout')
}

/** Flags a response as abusive so it can be reviewed. It stays in the inbox, marked Reported. */
export async function reportResponse(formData: FormData) {
  const user = await owner()
  const responseId = String(formData.get('responseId') ?? '')
  await withOwnerDb(user.id, (db) => db.update(schema.responses).set({ flagged: true, readAt: new Date() }).where(and(eq(schema.responses.id, responseId), eq(schema.responses.userId, user.id))))
  revalidatePath('/app', 'layout')
}

/**
 * Deletes the account and everything it owns (codes, Modes, responses, events and their
 * attendees) through database cascades. Asks for the word DELETE, and Better Auth refuses
 * unless the sign-in is recent, so a borrowed open laptop is not enough.
 */
export async function deleteAccount(formData: FormData) {
  await owner()
  if (String(formData.get('confirm') ?? '').trim().toUpperCase() !== 'DELETE') redirect('/app/profile?error=confirm')
  try {
    await auth.api.deleteUser({ headers: await headers(), body: {} })
  } catch (error) {
    console.error('[account] delete failed:', error)
    redirect('/app/profile?error=reauth')
  }
  redirect('/?deleted=1')
}

/** Start Pro through Stripe Checkout. The plan changes only when the signed webhook confirms it. */
export async function startPro() {
  const user = await owner()
  const [row] = await withOwnerDb(user.id, (db) => db.select({ customer: schema.users.stripeCustomerId, plan: schema.users.plan }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1))
  if (row?.plan !== 'free') redirect('/app/profile')
  const url = await createProCheckout({ userId: user.id, email: user.email, customerId: row.customer, successUrl: `${appBaseUrl()}/app/profile?pro=1`, cancelUrl: `${appBaseUrl()}/app/profile` })
  redirect(url ?? '/app/profile?error=payments')
}

/** Change card or cancel Pro on Stripe's own page. */
export async function openBilling() {
  const user = await owner()
  const [row] = await withOwnerDb(user.id, (db) => db.select({ customer: schema.users.stripeCustomerId }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1))
  const url = row?.customer ? await createBillingPortal(row.customer, `${appBaseUrl()}/app/profile`) : null
  redirect(url ?? '/app/profile?error=payments')
}
