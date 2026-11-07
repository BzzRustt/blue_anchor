'use server'

import { and, eq, gte, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { schema, withOwnerDb } from '@/lib/db'
import {
  DEFAULT_QUESTIONS,
  eventSlug,
  formatTag,
  generateAccessCode,
  nextNumber,
  parseRoles,
  parseRoster,
  type Role,
} from '@/lib/events'
import { requireOwner } from '@/lib/owner'
import {
  canAddAttendee,
  canCreateEvent,
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
  redirect(`${path}?${query}`)
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
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))

  const result = await withOwnerDb(userId, async (db): Promise<{ blocked: string } | { id: string }> => {
    const [owner] = await db.select({ plan: schema.users.plan }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    const plan = (owner?.plan ?? 'free') as Plan

    if (roles.length && !canUseRoleLetters(plan).ok) return { blocked: 'pro_roles' }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.events)
      .where(and(eq(schema.events.userId, userId), gte(schema.events.createdAt, yearStart)))
    if (!canCreateEvent(plan, count).ok) return { blocked: 'event_limit' }

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
  build: (event: { roles: Role[] }) => { rows: Array<{ name: string; email: string | null; letter: string | null }>; error?: string },
  source: 'import' | 'walk_up'
): Promise<{ added: number } | { error: string; detail?: string }> {
  return withOwnerDb(userId, async (db) => {
    // The userId predicate is belt and braces: RLS already scopes this to the organiser.
    const [event] = await db
      .select({ id: schema.events.id, roleSet: schema.events.roleSet })
      .from(schema.events)
      .where(and(eq(schema.events.id, eventId), eq(schema.events.userId, userId)))
      .limit(1)
    if (!event) return { error: 'not_found' }

    const roles = (event.roleSet as Role[]) ?? []
    const built = build({ roles })
    if (built.error) return { error: 'roster', detail: built.error }
    if (!built.rows.length) return { error: 'empty' }

    const [owner] = await db.select({ plan: schema.users.plan }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    const existing = await db.select({ tag: schema.eventAttendees.tag }).from(schema.eventAttendees).where(eq(schema.eventAttendees.eventId, event.id))

    // Gate on the last row we would add: all-or-nothing, so a roster never half-imports.
    const gate = canAddAttendee((owner?.plan ?? 'free') as Plan, existing.length + built.rows.length - 1)
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
        source,
        status: 'invited' as const,
      }
    })

    await db.insert(schema.eventAttendees).values(values)
    return { added: values.length }
  })
}

export async function importRoster(formData: FormData) {
  const session = await requireOwner()
  const eventId = String(formData.get('eventId') ?? '')
  if (!uuid.safeParse(eventId).success) redirect('/app/events')
  const here = `/app/events/${eventId}`

  const text = String(formData.get('roster') ?? '').slice(0, 40_000)
  const result = await allocate(session.user.id, eventId, ({ roles }) => {
    const letters = roles.map((role) => role.letter)
    const { rows, errors } = parseRoster(text, letters)
    if (errors.length) return { rows: [], error: errors.slice(0, 3).join(' ') }
    // In a role-based event a tag with no letter would sit outside every sequence.
    const bare = rows.findIndex((row) => letters.length && !row.letter)
    if (bare !== -1) return { rows: [], error: `${rows[bare].name} needs a role letter (${letters.join(', ')}).` }
    return { rows }
  }, 'import')

  if ('error' in result) return fail(here, result.error, result.detail)
  revalidatePath(here)
  redirect(`${here}?added=${result.added}`)
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
  const here = `/app/events/${eventId}`

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
  revalidatePath(here)
  redirect(`${here}?added=${result.added}`)
}
