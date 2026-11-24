'use server'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import sharp from 'sharp'
import { z } from 'zod'
import { checkNickname, imageKind, PHOTO_MAX_BYTES } from '@/lib/profile-rules'
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
  const nickname = checkNickname(parsed.data.handle ?? '')
  if (!nickname.ok) redirect(`/app/profile?error=nickname&detail=${encodeURIComponent(nickname.reason)}`)
  const emptyToNull = (value?: string) => value || null
  try {
  // The photo is managed by uploadPhoto/removePhoto, so saving the profile never touches it.
  await withOwnerDb(user.id, (db) => db.update(schema.users).set({
      name: parsed.data.name,
      handle: nickname.value,
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
  redirect('/app/profile?done=saved')
}

/**
 * Profile photo upload. The file must really be a JPEG, PNG or WebP (checked from its bytes), at most
 * 5 MB and 40 megapixels. It is then re-encoded to a 512 px WebP with all metadata dropped, so
 * nothing in the original file (location data, hidden payloads) is ever stored or served.
 */
export async function uploadPhoto(formData: FormData) {
  const user = await owner()
  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) redirect('/app/profile?error=photo')
  if (file.size > PHOTO_MAX_BYTES) redirect('/app/profile?error=photo_size')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!imageKind(bytes)) redirect('/app/profile?error=photo_type')
  let webp: Buffer
  try {
    webp = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize(512, 512, { fit: 'cover' }).webp({ quality: 82 }).toBuffer()
  } catch {
    redirect('/app/profile?error=photo_type')
  }
  await withOwnerDb(user.id, async (db) => {
    await db.execute(sql`insert into user_photos (user_id, mime, bytes, updated_at) values (${user.id}, 'image/webp', decode(${webp.toString('base64')}, 'base64'), now())
      on conflict (user_id) do update set bytes = excluded.bytes, mime = excluded.mime, updated_at = now()`)
    await db.update(schema.users).set({ image: `/p/${encodeURIComponent(user.id)}?v=${Date.now()}`, updatedAt: new Date() }).where(eq(schema.users.id, user.id))
  })
  revalidatePath('/app', 'layout')
  revalidatePath('/t', 'layout')
  redirect('/app/profile?done=photo')
}

export async function removePhoto() {
  const user = await owner()
  await withOwnerDb(user.id, async (db) => {
    await db.execute(sql`delete from user_photos where user_id = ${user.id}`)
    await db.update(schema.users).set({ image: null, updatedAt: new Date() }).where(eq(schema.users.id, user.id))
  })
  revalidatePath('/app', 'layout')
  revalidatePath('/t', 'layout')
  redirect('/app/profile?done=saved')
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

/**
 * Stops further responses from this visitor (spec: blocking is free on every plan). The lasting block
 * is on their browser token; their network address is blocked for 24 hours only, so other people on a
 * shared Wi-Fi are not shut out for good. All of this visitor's responses move to Blocked.
 */
export async function blockSender(formData: FormData) {
  const user = await owner()
  const responseId = String(formData.get('responseId') ?? '')
  await withOwnerDb(user.id, async (db) => {
    const [response] = await db.select({ deviceHash: schema.responses.deviceHash, token: schema.responses.sessionToken }).from(schema.responses).where(and(eq(schema.responses.id, responseId), eq(schema.responses.userId, user.id))).limit(1)
    if (!response) return
    await db.insert(schema.blockedDevices).values({ userId: user.id, sessionToken: response.token, deviceHash: response.deviceHash }).onConflictDoNothing()
    await db.update(schema.responses).set({ blocked: true, archived: true, readAt: new Date() }).where(and(eq(schema.responses.userId, user.id), eq(schema.responses.sessionToken, response.token)))
  })
  revalidatePath('/app', 'layout')
}

export async function unarchiveResponse(formData: FormData) {
  const user = await owner()
  const responseId = String(formData.get('responseId') ?? '')
  await withOwnerDb(user.id, (db) => db.update(schema.responses).set({ archived: false }).where(and(eq(schema.responses.id, responseId), eq(schema.responses.userId, user.id), eq(schema.responses.blocked, false))))
  revalidatePath('/app', 'layout')
}

export async function markResponseUnread(formData: FormData) {
  const user = await owner()
  const responseId = String(formData.get('responseId') ?? '')
  await withOwnerDb(user.id, (db) => db.update(schema.responses).set({ readAt: null }).where(and(eq(schema.responses.id, responseId), eq(schema.responses.userId, user.id))))
  revalidatePath('/app', 'layout')
}

/** Lifts a block: that visitor can respond again. Their earlier responses stay archived. */
export async function unblockSender(formData: FormData) {
  const user = await owner()
  const responseId = String(formData.get('responseId') ?? '')
  await withOwnerDb(user.id, async (db) => {
    const [response] = await db.select({ deviceHash: schema.responses.deviceHash, token: schema.responses.sessionToken }).from(schema.responses).where(and(eq(schema.responses.id, responseId), eq(schema.responses.userId, user.id))).limit(1)
    if (!response) return
    // Their browser block, and the network backstop that was created with it.
    await db.delete(schema.blockedDevices).where(and(eq(schema.blockedDevices.userId, user.id), eq(schema.blockedDevices.sessionToken, response.token)))
    await db.update(schema.responses).set({ blocked: false }).where(and(eq(schema.responses.userId, user.id), eq(schema.responses.sessionToken, response.token)))
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
  if (String(formData.get('confirm') ?? '').trim().toUpperCase() !== 'DELETE') redirect('/app/settings?error=confirm')
  try {
    await auth.api.deleteUser({ headers: await headers(), body: {} })
  } catch (error) {
    console.error('[account] delete failed:', error)
    redirect('/app/settings?error=reauth')
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
