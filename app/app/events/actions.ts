'use server'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import sharp from 'sharp'
import { z } from 'zod'
import { schema, withOwnerDb } from '@/lib/db'
import {
  DEFAULT_QUESTIONS,
  eventSlug,
  formatTag,
  generateAccessCode,
  nextNumber,
  fromLocalInput,
  parseImport,
  parseRoles,
  type Role,
} from '@/lib/events'
import { newAccessToken } from '@/lib/attendee-access'
import { appBaseUrl } from '@/lib/event-queries'
import { findPackage } from '@/lib/event-packages'
import { requireOwner } from '@/lib/owner'
import { imageKind, PHOTO_MAX_BYTES } from '@/lib/profile-rules'
import { createCheckoutSession, stripeConfigured } from '@/lib/stripe'
import {
  canAddAttendee,
  canUseRoleLetters,
  directoryExpiresAt,
  type Plan,
} from '@/lib/plans'

/** Datetime-local has no zone. The browser sends its UTC offset and we apply it. */
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
const question = z.string().trim().min(3).max(120)

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  venue: z.string().trim().max(120).optional(),
  startsAt: localDateTime,
  endsAt: localDateTime,
  // ponytail: offset is read at creation time, so an event across a DST change is off by an
  // hour. Store an IANA zone on the event when that matters.
  tzOffset: z.coerce.number().int().min(-840).max(840).default(0),
  tzName: z.string().max(64).regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/).default('Europe/London'),
  description: z.string().trim().max(500).optional(),
  roles: z.string().max(400).optional(),
  q0: question,
  q1: question,
  q2: question,
  q3: question,
})

function toUtc(local: string, tzOffset: number): Date {
  return new Date(Date.parse(`${local}:00Z`) + tzOffset * 60_000)
}

/** Redirect with a short error code; the page maps it to wording. Never reflects input. */
function fail(path: string, code: string, detail?: string): never {
  const query = new URLSearchParams({ error: code })
  if (detail) query.set('detail', detail.slice(0, 200))
  redirect(`${path}${path.includes('?') ? '&' : '?'}${query}`)
}

const TABS = ['overview', 'attendees', 'badges', 'settings'] as const
/** The event page and tab to return to (the form says which tab it was on); always has a query string. */
function eventHere(eventId: string, formData: FormData, fallback: (typeof TABS)[number]) {
  const tab = String(formData.get('tab') ?? '')
  const q = String(formData.get('q') ?? '').slice(0, 60)
  return `/app/events/${eventId}?tab=${(TABS as readonly string[]).includes(tab) ? tab : fallback}${q ? `&q=${encodeURIComponent(q)}` : ''}`
}

export async function createEvent(formData: FormData) {
  const session = await requireOwner()
  const userId = session.user.id
  const parsed = createSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return fail('/app/events/new', 'invalid')

  const startsAt = toUtc(parsed.data.startsAt, parsed.data.tzOffset)
  const endsAt = toUtc(parsed.data.endsAt, parsed.data.tzOffset)
  if (endsAt <= startsAt) return fail('/app/events/new', 'dates')

  const rolesInput = parsed.data.roles?.trim() ?? ''
  const { roles, error: rolesError } = parseRoles(rolesInput)
  if (rolesError) return fail('/app/events/new', 'roles', rolesError)

  const questions = [parsed.data.q0, parsed.data.q1, parsed.data.q2, parsed.data.q3]

  const result = await withOwnerDb(userId, async (db): Promise<{ blocked: string } | { id: string }> => {
    const [owner] = await db.select({ plan: schema.users.plan }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    const plan = (owner?.plan ?? 'free') as Plan

    if (roles.length && !canUseRoleLetters(plan).ok) return { blocked: 'pro_roles' }

    // Creating and previewing is free (pay to publish), so the cap is only a spam guard on open drafts.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.events)
      .where(and(eq(schema.events.userId, userId), sql`${schema.events.status} in ('draft','awaiting_payment')`))
    if (count >= 20) return { blocked: 'event_limit' }

    // An event owns a code and a campaign, which is what lets it reuse the whole spine
    // (permanent slug, kill switch, question blocks) without touching either table's shape.
    const [code] = await db.insert(schema.codes).values({
      userId,
      slug: eventSlug(parsed.data.name),
      label: parsed.data.name,
      kind: 'event',
    }).returning()

    const [campaign] = await db.insert(schema.campaigns).values({
      userId,
      codeId: code.id,
      name: parsed.data.name,
      mode: 'event',
      status: 'live',
      repeatPolicy: 'always_open',
    }).returning()

    await db.insert(schema.questionBlocks).values(
      questions.map((prompt, position) => ({
        campaignId: campaign.id,
        type: 'open_text' as const,
        position,
        required: position < 2,
        config: { prompt, placeholder: DEFAULT_QUESTIONS[position].placeholder },
      }))
    )

    const [event] = await db.insert(schema.events).values({
      userId,
      codeId: code.id,
      campaignId: campaign.id,
      name: parsed.data.name,
      venue: parsed.data.venue || null,
      startsAt,
      endsAt,
      accessCode: generateAccessCode(),
      roleSet: roles,
      directoryExpiresAt: directoryExpiresAt(endsAt),
      status: 'draft',
      timezone: parsed.data.tzName,
      description: parsed.data.description || null,
    }).returning({ id: schema.events.id })

    return { id: event.id }
  })

  if ('blocked' in result) return fail('/app/events/new', result.blocked)
  revalidatePath('/app/events')
  redirect(`/app/events/${result.id}`)
}

const uuid = z.uuid()

/**
 * Allocates tags and inserts attendee rows. Shared by the roster import and the spare-tag
 * generator: both are "reserve N numbers at this event", differing only in who the rows are.
 */
async function allocate(
  userId: string,
  eventId: string,
  build: (event: { roles: Role[] }) => { rows: Array<{ name: string; email: string | null; letter: string | null; ref?: string | null }>; error?: string; skipped?: number },
  source: 'import' | 'walk_up',
  sharedEmail = false
): Promise<{ added: number; skipped: number } | { error: string; detail?: string }> {
  return withOwnerDb(userId, async (db) => {
    // The userId predicate is belt and braces: RLS already scopes this to the organiser.
    const [event] = await db
      .select({ id: schema.events.id, roleSet: schema.events.roleSet, capacity: schema.events.capacity })
      .from(schema.events)
      .where(and(eq(schema.events.id, eventId), eq(schema.events.userId, userId)))
      .limit(1)
    if (!event) return { error: 'not_found' }

    const roles = (event.roleSet as Role[]) ?? []
    const built = build({ roles })
    if (built.error) return { error: 'roster', detail: built.error }
    if (!built.rows.length) return { error: 'empty' }

    const [owner] = await db.select({ plan: schema.users.plan }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    const existing = await db.select({ tag: schema.eventAttendees.tag, email: schema.eventAttendees.email, name: schema.eventAttendees.displayName, ref: schema.eventAttendees.externalRef, status: schema.eventAttendees.status }).from(schema.eventAttendees).where(eq(schema.eventAttendees.eventId, event.id))

    // Exact repeats are skipped and counted, never merged. A shared (group) email is allowed to repeat;
    // people are then told apart by name.
    const haveEmail = new Set(existing.map((r) => r.email?.toLowerCase()).filter(Boolean))
    const haveRef = new Set(existing.map((r) => r.ref).filter(Boolean))
    const haveName = new Set(existing.map((r) => r.name.toLowerCase()))
    let skipped = built.skipped ?? 0
    built.rows = built.rows.filter((row) => {
      const dup = (!sharedEmail && row.email && haveEmail.has(row.email)) || (row.ref && haveRef.has(row.ref)) || (sharedEmail && haveName.has(row.name.toLowerCase()))
      if (dup) skipped++
      return !dup
    })
    if (!built.rows.length) return { error: 'empty', detail: skipped ? `Everyone in that list is already registered (${skipped} skipped).` : undefined }

    // Gate on the last row we would add: all-or-nothing, so a roster never half-imports. Uses the
    // purchased capacity when there is one, and removed (withdrawn) people don't take a place.
    const active = existing.filter((row) => row.status !== 'withdrawn').length
    const gate = canAddAttendee((owner?.plan ?? 'free') as Plan, active + built.rows.length - 1, event.capacity)
    if (!gate.ok) return { error: 'attendee_limit', detail: gate.reason }

    const tags = existing.map((row) => row.tag)
    const next = new Map<string | null, number>()
    const values = built.rows.map((row) => {
      const n = next.get(row.letter) ?? nextNumber(tags, row.letter)
      next.set(row.letter, n + 1)
      return {
        eventId: event.id,
        tag: formatTag(row.letter, n),
        roleLetter: row.letter,
        displayName: row.name,
        email: row.email,
        externalRef: row.ref ?? null,
        source,
        status: 'invited' as const,
      }
    })

    await db.insert(schema.eventAttendees).values(values)
    return { added: values.length, skipped }
  })
}

export async function importRoster(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  if (!uuid.safeParse(eventId).success) redirect('/app/events')
  const here = eventHere(eventId, formData, 'attendees')

  // A CSV file, if one was chosen, wins over the pasted text.
  const file = formData.get('file')
  const text = (file instanceof File && file.size > 0 && file.size < 300_000 ? await file.text() : String(formData.get('roster') ?? '')).slice(0, 300_000)
  const result = await allocate(session.user.id, eventId, ({ roles }) => {
    const letters = roles.map((role) => role.letter)
    const { rows, errors, skipped } = parseImport(text, letters)
    if (errors.length) return { rows: [], error: errors.slice(0, 3).join(' ') }
    // In a role-based event a tag with no letter would sit outside every sequence.
    const bare = rows.findIndex((row) => letters.length && !row.letter)
    if (bare !== -1) return { rows: [], error: `${rows[bare].name} needs a role letter (${letters.join(', ')}).` }
    return { rows, skipped }
  }, 'import')

  if ('error' in result) return fail(here, result.error, result.detail)
  revalidatePath(`/app/events/${eventId}`)
  redirect(`${here}&added=${result.added}&skipped=${result.skipped}`)
}

const personSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.union([z.literal(''), z.email()]).optional(),
  letter: z.string().trim().max(1).optional(),
})

/** One person, with an optional email and role letter. */
export async function addPerson(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  if (!uuid.safeParse(eventId).success) redirect('/app/events')
  const here = eventHere(eventId, formData, 'attendees')
  const parsed = personSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return fail(here, 'invalid')
  const result = await allocate(session.user.id, eventId, ({ roles }) => {
    const letter = parsed.data.letter ? parsed.data.letter.toUpperCase() : null
    if (roles.length && !roles.some((role) => role.letter === letter)) return { rows: [], error: `Choose one of this event's roles: ${roles.map((r) => r.letter).join(', ')}.` }
    return { rows: [{ name: parsed.data.name, email: parsed.data.email ? parsed.data.email.toLowerCase() : null, letter: roles.length ? letter : null }] }
  }, 'import')
  if ('error' in result) return fail(here, result.error, result.detail)
  revalidatePath(`/app/events/${eventId}`)
  redirect(`${here}&added=${result.added}&skipped=${result.skipped}`)
}

const groupSchema = z.object({ contactEmail: z.email(), names: z.string().max(8000), letter: z.string().trim().max(1).optional() })

/** A group booking: several separate people who share one contact email. Each gets their own tag. */
export async function addGroup(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  if (!uuid.safeParse(eventId).success) redirect('/app/events')
  const here = eventHere(eventId, formData, 'attendees')
  const parsed = groupSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return fail(here, 'invalid')
  const result = await allocate(session.user.id, eventId, ({ roles }) => {
    const letter = parsed.data.letter ? parsed.data.letter.toUpperCase() : null
    if (roles.length && !roles.some((role) => role.letter === letter)) return { rows: [], error: `Choose one of this event's roles: ${roles.map((r) => r.letter).join(', ')}.` }
    const names = [...new Set(parsed.data.names.split(/\r?\n/).map((n) => n.trim()).filter(Boolean))]
    const bad = names.find((n) => n.length < 2 || n.length > 80)
    if (bad) return { rows: [], error: `"${bad.slice(0, 30)}" is not a valid name (2-80 characters).` }
    return { rows: names.map((name) => ({ name, email: parsed.data.contactEmail.toLowerCase(), letter: roles.length ? letter : null })) }
  }, 'import', true)
  if ('error' in result) return fail(here, result.error, result.detail)
  revalidatePath(`/app/events/${eventId}`)
  redirect(`${here}&added=${result.added}&skipped=${result.skipped}`)
}

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  venue: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  startsAt: localDateTime,
  endsAt: localDateTime,
  discovery: z.enum(['off', 'badge', 'directory']),
  networkingOpensAt: z.union([z.literal(''), localDateTime]).optional(),
})

/** Details, reschedule and networking settings. Tags, QR codes and the access code never change. */
export async function updateEventSettings(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  if (!uuid.safeParse(eventId).success) redirect('/app/events')
  const here = eventHere(eventId, formData, 'settings')
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return fail(here, 'invalid')
  const messaging = formData.get('messagingEnabled') === 'on'

  const updated = await withOwnerDb(session.user.id, async (db) => {
    const [event] = await db.select({ timezone: schema.events.timezone, status: schema.events.status }).from(schema.events)
      .where(and(eq(schema.events.id, eventId), eq(schema.events.userId, session.user.id))).limit(1)
    if (!event || event.status === 'cancelled') return 'not_found'
    const startsAt = fromLocalInput(parsed.data.startsAt, event.timezone)
    const endsAt = fromLocalInput(parsed.data.endsAt, event.timezone)
    if (endsAt <= startsAt) return 'dates'
    const opens = parsed.data.networkingOpensAt ? fromLocalInput(parsed.data.networkingOpensAt, event.timezone) : null
    if (opens && opens > endsAt) return 'dates'
    await db.update(schema.events).set({
      name: parsed.data.name, venue: parsed.data.venue || null, description: parsed.data.description || null,
      startsAt, endsAt, directoryExpiresAt: directoryExpiresAt(endsAt),
      discovery: parsed.data.discovery, messagingEnabled: messaging, networkingOpensAt: opens, updatedAt: new Date(),
    }).where(eq(schema.events.id, eventId))
    return 'ok'
  })
  if (updated !== 'ok') return fail(here, updated)
  revalidatePath(`/app/events/${eventId}`)
  redirect(`${here}&done=saved`)
}

const MAX_EVENT_QUESTIONS = 6

/**
 * Edit the questions attendees answer: reword any of them, set the short label shown on cards, and
 * add up to two optional extras (e.g. "A fun fact about you"). Existing questions keep their ids, so
 * answers already given stay attached. Clearing an added extra removes it; the first four stay.
 */
export async function updateEventQuestions(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  if (!uuid.safeParse(eventId).success) redirect('/app/events')
  const here = eventHere(eventId, formData, 'settings')
  const text = (key: string, max: number) => String(formData.get(key) ?? '').trim().slice(0, max)

  const result = await withOwnerDb(session.user.id, async (db) => {
    const [event] = await db.select({ campaignId: schema.events.campaignId, status: schema.events.status }).from(schema.events)
      .where(and(eq(schema.events.id, eventId), eq(schema.events.userId, session.user.id))).limit(1)
    if (!event || event.status === 'cancelled') return 'not_found'
    const blocks = await db.select().from(schema.questionBlocks).where(eq(schema.questionBlocks.campaignId, event.campaignId))
    const byId = new Map(blocks.map((b) => [b.id, b]))
    let nextPosition = Math.max(-1, ...blocks.map((b) => b.position)) + 1
    for (let n = 0; n < MAX_EVENT_QUESTIONS; n++) {
      const id = text(`qid_${n}`, 40)
      const prompt = text(`prompt_${n}`, 120)
      const label = text(`label_${n}`, 40)
      const existing = id ? byId.get(id) : undefined
      if (existing) {
        const config = existing.config as Record<string, unknown>
        if (!prompt) {
          if (existing.position >= 4) await db.delete(schema.questionBlocks).where(eq(schema.questionBlocks.id, existing.id))
          continue
        }
        await db.update(schema.questionBlocks).set({ config: { ...config, prompt, label: label || undefined } }).where(eq(schema.questionBlocks.id, existing.id))
      } else if (prompt && blocks.length < MAX_EVENT_QUESTIONS) {
        if (prompt.length < 3) return 'invalid'
        await db.insert(schema.questionBlocks).values({ campaignId: event.campaignId, type: 'open_text', position: nextPosition++, required: false, config: { prompt, label: label || undefined, placeholder: 'Optional' } })
      }
    }
    return 'ok'
  })
  if (result !== 'ok') return fail(here, result)
  revalidatePath(`/app/events/${eventId}`)
  redirect(`${here}&done=saved`)
}

/** Basic check-in: toggles the arrival time for one attendee. */
export async function toggleCheckIn(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  const attendeeId = String(formData.get('attendeeId') ?? '')
  if (!uuid.safeParse(eventId).success || !uuid.safeParse(attendeeId).success) redirect('/app/events')
  const [row] = await withOwnerDb(session.user.id, async (db) => (await db.execute<{ checked: boolean }>(sql`
    update event_attendees set checked_in_at = case when checked_in_at is null then now() else null end
    where id = ${attendeeId}::uuid and event_id = ${eventId}::uuid returning checked_in_at is not null as checked`)).rows)
  revalidatePath(`/app/events/${eventId}`)
  redirect(`${eventHere(eventId, formData, 'attendees')}&done=${row?.checked ? 'checked_in' : 'checked_out'}`)
}

/**
 * Organiser removes someone (a no-show, a duplicate, a fake sign-up). Their place is freed, their
 * card leaves the directory and their tag number is never reused. The row is kept, so a mistaken
 * removal can be undone by re-adding the person.
 */
export async function removeAttendee(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  const attendeeId = String(formData.get('attendeeId') ?? '')
  if (!uuid.safeParse(eventId).success || !uuid.safeParse(attendeeId).success) redirect('/app/events')
  await withOwnerDb(session.user.id, async (db) => {
    await db.execute(sql`update event_attendees set status = 'withdrawn', updated_at = now() where id = ${attendeeId}::uuid and event_id = ${eventId}::uuid`)
    await db.execute(sql`update attendee_access_tokens set revoked_at = now() where attendee_id = ${attendeeId}::uuid and revoked_at is null`)
    await db.insert(schema.auditLog).values({ userId: session.user.id, eventId, action: 'remove_attendee', targetId: attendeeId })
  })
  revalidatePath(`/app/events/${eventId}`)
  redirect(`${eventHere(eventId, formData, 'attendees')}&done=removed`)
}

const spareSchema = z.object({
  count: z.coerce.number().int().min(1).max(100),
  letter: z.string().trim().max(1).optional(),
})

/** Pre-printed blank badges for people who register on the day. */
export async function addSpareTags(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  if (!uuid.safeParse(eventId).success) redirect('/app/events')
  const here = eventHere(eventId, formData, 'attendees')

  const parsed = spareSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return fail(here, 'invalid')

  const result = await allocate(session.user.id, eventId, ({ roles }) => {
    const letter = parsed.data.letter ? parsed.data.letter.toUpperCase() : null
    if (roles.length && !roles.some((role) => role.letter === letter)) {
      return { rows: [], error: `Choose one of this event's roles: ${roles.map((r) => r.letter).join(', ')}.` }
    }
    if (!roles.length && letter) return { rows: [], error: 'This event does not use role letters.' }
    return { rows: Array.from({ length: parsed.data.count }, () => ({ name: 'Walk-up', email: null, letter })) }
  }, 'walk_up')

  if ('error' in result) return fail(here, result.error, result.detail)
  revalidatePath(`/app/events/${eventId}`)
  redirect(`${here}&added=${result.added}`)
}

/** Starts Stripe Checkout for an event's chosen package. Publishing happens only in the webhook. */
export async function startPublish(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  if (!uuid.safeParse(eventId).success) redirect('/app/events')
  const here = `/app/events/${eventId}`
  const pkg = findPackage(String(formData.get('package') ?? ''))
  if (!pkg) return fail(here, 'invalid')
  if (!stripeConfigured()) return fail(here, 'payments_off')

  const userId = session.user.id
  const purchase = await withOwnerDb(userId, async (db) => {
    const [event] = await db.select({ id: schema.events.id, name: schema.events.name, status: schema.events.status })
      .from(schema.events).where(and(eq(schema.events.id, eventId), eq(schema.events.userId, userId))).limit(1)
    // Published events can buy a bigger package (capacity upgrade); confirmation keeps the larger capacity.
    if (!event || event.status === 'cancelled') return null
    const [row] = await db.insert(schema.eventPurchases).values({
      eventId, userId, packageKey: pkg.key, capacity: pkg.capacity, amountPence: pkg.pricePence,
    }).returning({ id: schema.eventPurchases.id })
    if (event.status !== 'published') await db.execute(sql`select event_set_status(${eventId}::uuid, 'awaiting_payment')`)
    return { id: row.id, name: event.name }
  })
  if (!purchase) return fail(here, 'not_found')

  const checkout = await createCheckoutSession({
    amountPence: pkg.pricePence, currency: 'gbp', productName: `${purchase.name} – ${pkg.name}`, purchaseId: purchase.id,
    successUrl: `${appBaseUrl()}${here}?paid=1`, cancelUrl: `${appBaseUrl()}${here}?error=cancelled`,
  })
  if (!checkout) return fail(here, 'payments_off')
  await withOwnerDb(userId, (db) => db.execute(sql`update event_purchases set stripe_session_id = ${checkout.id} where id = ${purchase.id}::uuid`))
  redirect(checkout.url)
}

/**
 * Cancelling is deliberately hard to do by accident: the organiser types the event's exact name
 * (checked again here, not only in the browser), after reading what attendees will lose.
 */
export async function cancelEvent(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  if (!uuid.safeParse(eventId).success) redirect('/app/events')
  const typed = String(formData.get('confirmName') ?? '').trim()
  const here = `/app/events/${eventId}?tab=settings`
  const done = await withOwnerDb(session.user.id, async (db) => {
    const [event] = await db.select({ name: schema.events.name }).from(schema.events).where(and(eq(schema.events.id, eventId), eq(schema.events.userId, session.user.id))).limit(1)
    if (!event || event.name.trim() !== typed) return false
    await db.execute(sql`select event_set_status(${eventId}::uuid, 'cancelled')`)
    await db.insert(schema.auditLog).values({ userId: session.user.id, eventId, action: 'cancel_event' })
    return true
  })
  if (!done) return fail(here, 'confirm_name')
  revalidatePath('/app/events')
  redirect(`/app/events/${eventId}?tab=overview&done=cancelled`)
}

/**
 * Organiser-assisted access: a personal link for one attendee, e.g. someone who lost their
 * phone or has no working email. Issuing revokes that attendee's earlier links and is written
 * to the audit log. ponytail: the link comes back in the organiser's own URL (query string) so
 * it can be copied; move to a one-time flash if organiser browser history becomes a concern.
 */
export async function issueAccessLink(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  const attendeeId = String(formData.get('attendeeId') ?? '')
  if (!uuid.safeParse(eventId).success || !uuid.safeParse(attendeeId).success) redirect('/app/events')
  const here = eventHere(eventId, formData, 'attendees')
  const userId = session.user.id
  const { token, hash } = newAccessToken()

  const issued = await withOwnerDb(userId, async (db) => {
    const [row] = await db
      .select({ slug: schema.codes.slug, expires: schema.events.directoryExpiresAt, status: schema.events.status, name: schema.eventAttendees.displayName })
      .from(schema.eventAttendees)
      .innerJoin(schema.events, eq(schema.events.id, schema.eventAttendees.eventId))
      .innerJoin(schema.codes, eq(schema.codes.id, schema.events.codeId))
      .where(and(eq(schema.eventAttendees.id, attendeeId), eq(schema.events.id, eventId), eq(schema.events.userId, userId)))
      .limit(1)
    if (!row || row.status === 'cancelled') return null
    await db.execute(sql`update attendee_access_tokens set revoked_at = now() where attendee_id = ${attendeeId}::uuid and revoked_at is null`)
    await db.insert(schema.attendeeAccessTokens).values({ attendeeId, eventId, tokenHash: hash, createdBy: 'organiser', expiresAt: row.expires })
    await db.insert(schema.auditLog).values({ userId, eventId, action: 'issue_access_link', targetId: attendeeId })
    return row
  })
  if (!issued) return fail(here, 'not_found')
  const link = `${appBaseUrl()}/e/${encodeURIComponent(issued.slug)}/access?t=${token}`
  redirect(`${here}&link=${encodeURIComponent(link)}&for=${encodeURIComponent(issued.name.slice(0, 80))}`)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Saves a cover photo for the organiser's own event: checked, cropped to 2:1 and re-encoded as WebP. */
export async function uploadEventCover(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  if (!UUID.test(eventId)) redirect('/app/events')
  const here = `/app/events/${eventId}?tab=settings`
  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) fail(here, 'cover')
  if (file.size > PHOTO_MAX_BYTES) fail(here, 'cover_size')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!imageKind(bytes)) fail(here, 'cover_type')
  let webp: Buffer
  try {
    webp = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize(1280, 640, { fit: 'cover' }).webp({ quality: 80 }).toBuffer()
  } catch {
    fail(here, 'cover_type')
  }
  const saved = await withOwnerDb(session.user.id, async (db) => {
    // The policy only lets this run for an event the organiser owns; the select makes "not yours" a clean answer.
    const [event] = await db.select({ id: schema.events.id }).from(schema.events).where(and(eq(schema.events.id, eventId), eq(schema.events.userId, session.user.id))).limit(1)
    if (!event) return false
    await db.execute(sql`insert into event_covers (event_id, mime, bytes, updated_at) values (${eventId}::uuid, 'image/webp', decode(${webp.toString('base64')}, 'base64'), now())
      on conflict (event_id) do update set bytes = excluded.bytes, mime = excluded.mime, updated_at = now()`)
    await db.update(schema.events).set({ coverUrl: `/api/event-cover/${eventId}?v=${Date.now()}` }).where(eq(schema.events.id, eventId))
    return true
  })
  if (!saved) fail('/app/events', 'not_found')
  revalidatePath('/app/events')
  revalidatePath(`/app/events/${eventId}`)
  redirect(`${here}&cover=saved`)
}

export async function removeEventCover(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  if (!UUID.test(eventId)) redirect('/app/events')
  await withOwnerDb(session.user.id, async (db) => {
    await db.execute(sql`delete from event_covers where event_id = ${eventId}::uuid`)
    await db.update(schema.events).set({ coverUrl: null }).where(and(eq(schema.events.id, eventId), eq(schema.events.userId, session.user.id)))
  })
  revalidatePath('/app/events')
  revalidatePath(`/app/events/${eventId}`)
  redirect(`/app/events/${eventId}?tab=settings&cover=removed`)
}
