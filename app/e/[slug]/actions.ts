'use server'

import { eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { schema, visitorDb, withAttendeeDb } from '@/lib/db'
import {
  clientKey,
  getJoinContext,
  joinLimiter,
  loadMyCard,
  rememberAttendee,
  verifiedAttendeeId,
} from '@/lib/event-join'
import { asVisibility } from '@/lib/attendee-access'
import { attendeeAccessEmail, emailConfigured, sendEmail } from '@/lib/email'
import { appBaseUrl } from '@/lib/event-queries'
import { PLAN_LIMITS, canAddAttendee } from '@/lib/plans'
import { RateLimiter } from '@/lib/rate-limiter'
import { auth } from '@/lib/auth-server'
import { headers } from 'next/headers'

export type JoinState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'saved'; tag: string; name: string; created: boolean }

const fail = (message: string): JoinState => ({ status: 'error', message })

/**
 * One action for every door. A browser that already holds a valid attendee cookie is
 * editing its card; one that does not is registering and is handed the next free tag.
 * Everything is re-derived on the server: the slug in the form is only a lookup key, and
 * the attendee id comes from the signed cookie, never from the request body.
 */
export async function submitProfile(_previous: JoinState, formData: FormData): Promise<JoinState> {
  const ctx = await getJoinContext(String(formData.get('slug') ?? ''))
  if (!ctx) return fail('This event is no longer open.')

  const key = await clientKey(ctx.eventId)
  if (joinLimiter.isLimited(key)) return fail('Too many attempts from this connection. Please wait a few minutes and try again.')
  joinLimiter.increment(key)

  const name = String(formData.get('name') ?? '').trim()
  if (name.length < 2 || name.length > 80) return fail('Please enter your name (2 to 80 characters).')

  // Only this event's own questions are accepted, so a crafted request cannot stuff the
  // card with arbitrary keys.
  const answers: Record<string, string> = {}
  for (const question of ctx.questions) {
    const value = String(formData.get(`q_${question.id}`) ?? '').trim()
    if (value.length > 500) return fail('One answer is longer than 500 characters.')
    if (question.required && !value) return fail(`Please answer: ${question.prompt}`)
    if (value) answers[question.id] = value
  }

  const existingId = await verifiedAttendeeId(ctx.eventId)
  const card = existingId ? await loadMyCard(existingId, ctx.eventId) : null

  if (card) {
    const updated = await withAttendeeDb(card.id, (tx) => tx
      .update(schema.eventAttendees)
      .set({ displayName: name, answers, status: 'complete', updatedAt: new Date() })
      .where(eq(schema.eventAttendees.id, card.id))
      .returning({ id: schema.eventAttendees.id }))
    if (!updated.length) return fail('Your card could not be saved. Please reload the page.')
    return { status: 'saved', tag: card.tag, name, created: false }
  }

  const role = ctx.roles.length ? String(formData.get('role') ?? '') : null
  if (ctx.roles.length && !ctx.roles.some((candidate) => candidate.letter === role)) return fail('Please choose your role.')

  // New registrations need the event access code (printed on the poster / welcome slide).
  const code = String(formData.get('accessCode') ?? '').slice(0, 20)
  const codeResult = await visitorDb.execute(sql`select event_access_code_ok(${ctx.eventId}::uuid, ${code}::text) as ok`)
  const codeRows = (Array.isArray(codeResult) ? codeResult : (codeResult as { rows: unknown[] }).rows) as Array<{ ok: boolean }>
  if (!codeRows[0]?.ok) return fail('That access code does not match this event. It is on the poster or the welcome slide.')

  if (!canAddAttendee(ctx.plan, ctx.attendeeCount, ctx.capacity).ok) {
    return fail('This event has reached its attendee limit. Please speak to the organiser.')
  }

  try {
    const result = await visitorDb.execute(sql`
      select attendee_id, attendee_tag from register_attendee(
        ${ctx.eventId}::uuid, ${name}::text, ${role}::text,
        ${JSON.stringify(answers)}::jsonb, ${ctx.capacity ?? PLAN_LIMITS[ctx.plan].attendeesPerEvent}::integer)
    `)
    const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Array<Record<string, string>>
    const created = rows[0]
    if (!created) return fail('We could not register you. Please try again.')

    await rememberAttendee(ctx, created.attendee_id)
    return { status: 'saved', tag: created.attendee_tag, name, created: true }
  } catch (error) {
    const reason = error instanceof Error ? error.message : ''
    if (reason.includes('event_full')) return fail('This event has reached its attendee limit. Please speak to the organiser.')
    if (reason.includes('event_closed')) return fail('This event is no longer open.')
    console.error('[events] registration failed:', error)
    return fail('We could not register you. Please try again.')
  }
}

/** Takes the card out of the directory. Saving the profile again brings it back. */
export async function withdrawCard(formData: FormData) {
  const slug = String(formData.get('slug') ?? '')
  const ctx = await getJoinContext(slug)
  if (!ctx) redirect(`/e/${encodeURIComponent(slug)}`)

  const attendeeId = await verifiedAttendeeId(ctx.eventId)
  if (attendeeId) {
    await withAttendeeDb(attendeeId, (tx) => tx
      .update(schema.eventAttendees)
      .set({ status: 'withdrawn', updatedAt: new Date() })
      .where(eq(schema.eventAttendees.id, attendeeId)))
  }
  redirect(`/e/${encodeURIComponent(slug)}?left=1`)
}

/**
 * ponytail: in-memory per instance, like joinLimiter. Bounds guessing of access codes and
 * email floods per connection; sendEmail adds a per-recipient cap on top.
 */
const recoveryLimiter = new RateLimiter(10, 3_600_000)

export type RecoveryState = { status: 'idle' } | { status: 'done'; message: string }

/**
 * "Already registered": email + access code. Always answers with the same words, so it cannot
 * be used to learn whether someone is registered. Links are emailed, never shown here.
 */
export async function requestAccess(_previous: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const same: RecoveryState = { status: 'done', message: 'If that email is registered for this event, we have sent a personal link to it. It can take a few minutes.' }
  if (!emailConfigured()) return { status: 'done', message: 'Email links are not switched on for this event yet. Please ask the organiser for your personal link.' }

  const slug = String(formData.get('slug') ?? '')
  const ctx = await getJoinContext(slug)
  if (!ctx) return same
  const key = `recover:${await clientKey(ctx.eventId)}`
  if (recoveryLimiter.isLimited(key)) return { status: 'done', message: 'Too many attempts from this connection. Please wait and try again.' }
  recoveryLimiter.increment(key)

  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 200)
  const code = String(formData.get('accessCode') ?? '').slice(0, 20)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return same

  const result = await visitorDb.execute(sql`select display_name, token from request_attendee_access(${ctx.eventId}::uuid, ${email}::text, ${code}::text)`)
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Array<{ display_name: string; token: string }>
  if (rows.length) {
    const links = rows.map((row) => ({ name: row.display_name, url: `${appBaseUrl()}/e/${encodeURIComponent(slug)}/access?t=${row.token}` }))
    await sendEmail({ to: email, ...attendeeAccessEmail(ctx.name, links) }).catch((error) => console.error('[events] access email failed:', error))
  }
  return same
}

/** Who can see my card, whether people may send me requests, and whether to email me. */
export async function savePreferences(formData: FormData) {
  const slug = String(formData.get('slug') ?? '')
  const ctx = await getJoinContext(slug)
  if (!ctx) redirect(`/e/${encodeURIComponent(slug)}`)
  const attendeeId = await verifiedAttendeeId(ctx.eventId)
  if (attendeeId) {
    await withAttendeeDb(attendeeId, (tx) => tx
      .update(schema.eventAttendees)
      .set({
        profileVisibility: asVisibility(formData.get('visibility')),
        allowMessages: formData.get('allowMessages') === 'on',
        notifyEmail: formData.get('notifyEmail') === 'on',
        updatedAt: new Date(),
      })
      .where(eq(schema.eventAttendees.id, attendeeId)))
  }
  redirect(`/e/${encodeURIComponent(slug)}?prefs=1`)
}

/** Keep this attendee card on the signed-in ScanMe account (M8). Both identities are verified server-side. */
export async function linkAccount(formData: FormData) {
  const slug = String(formData.get('slug') ?? '')
  const ctx = await getJoinContext(slug)
  if (!ctx) redirect(`/e/${encodeURIComponent(slug)}`)
  const [session, attendeeId] = await Promise.all([auth.api.getSession({ headers: await headers() }), verifiedAttendeeId(ctx.eventId)])
  if (!session) redirect(`/login?next=${encodeURIComponent(`/e/${slug}`)}`)
  if (attendeeId) {
    await withAttendeeDb(attendeeId, (tx) => tx.execute(sql`select attendee_link_account(${session.user.id})`))
  }
  redirect(`/e/${encodeURIComponent(slug)}?linked=1`)
}
