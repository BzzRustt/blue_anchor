'use server'

import { and, eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { schema, withAttendeeDb } from '@/lib/db'
import { emailConfigured, messageRequestEmail, sendEmail } from '@/lib/email'
import { appBaseUrl } from '@/lib/event-queries'
import { attendeeSession, networkingErrorCode, rowsOf } from '@/lib/networking'

const uuid = z.uuid()

/**
 * Every action re-derives the attendee from the signed cookie; ids in the form are only
 * targets, and the SQL functions check them against that verified attendee.
 */
async function begin(formData: FormData) {
  const slug = String(formData.get('slug') ?? '')
  const back = String(formData.get('back') ?? '')
  const session = await attendeeSession(slug)
  if (!session?.me) redirect(`/e/${encodeURIComponent(slug)}`)
  // Only same-event paths are accepted as the place to return to.
  const base = `/e/${slug}`
  const here = back.startsWith(`${base}/`) || back === base ? back : base
  return { ...session, me: session.me, slug, here }
}

const go = (here: string, key: 'e' | 'ok', code: string): never => {
  const [path, query = ''] = here.split('?')
  const params = new URLSearchParams(query)
  params.delete('e'); params.delete('ok')
  params.set(key, code)
  redirect(`${path}?${params}`)
}

export async function toggleSaved(formData: FormData) {
  const { ctx, me, here } = await begin(formData)
  const target = String(formData.get('target') ?? '')
  if (!uuid.safeParse(target).success) go(here, 'e', 'error')
  const saved = formData.get('saved') === '1'
  try {
    await withAttendeeDb(me.id, (tx) => saved
      ? tx.delete(schema.savedAttendees).where(and(eq(schema.savedAttendees.attendeeId, me.id), eq(schema.savedAttendees.savedAttendeeId, target)))
      : tx.execute(sql`insert into saved_attendees (event_id, attendee_id, saved_attendee_id) values (${ctx.eventId}::uuid, ${me.id}::uuid, ${target}::uuid) on conflict do nothing`))
  } catch (error) {
    go(here, 'e', networkingErrorCode(error))
  }
  go(here, 'ok', saved ? 'unsaved' : 'saved')
}

export async function sendRequest(formData: FormData) {
  const { ctx, me, slug, here } = await begin(formData)
  const target = String(formData.get('target') ?? '')
  if (!uuid.safeParse(target).success) go(here, 'e', 'error')
  let notifyTo: string | null = null
  try {
    const [row] = await withAttendeeDb(me.id, async (tx) => rowsOf<{ notify_to: string | null }>(
      await tx.execute(sql`select * from message_request_send(${target}::uuid, ${String(formData.get('body') ?? '').slice(0, 600)})`)))
    notifyTo = row?.notify_to ?? null
  } catch (error) {
    go(here, 'e', networkingErrorCode(error))
  }
  if (notifyTo && emailConfigured()) {
    await sendEmail({ to: notifyTo, ...messageRequestEmail(ctx.name, `${appBaseUrl()}/e/${encodeURIComponent(slug)}/messages`) })
      .catch((error) => console.error('[networking] notice failed:', error))
  }
  go(here, 'ok', 'requested')
}

export async function respondRequest(formData: FormData) {
  const { me, here } = await begin(formData)
  const request = String(formData.get('request') ?? '')
  const action = String(formData.get('action') ?? '')
  if (!uuid.safeParse(request).success || !['accept', 'decline', 'block'].includes(action)) go(here, 'e', 'error')
  try {
    await withAttendeeDb(me.id, (tx) => tx.execute(sql`select message_request_respond(${request}::uuid, ${action})`))
  } catch (error) {
    go(here, 'e', networkingErrorCode(error))
  }
  go(here, 'ok', action)
}

export async function sendMessage(formData: FormData) {
  const { me, here } = await begin(formData)
  const request = String(formData.get('request') ?? '')
  if (!uuid.safeParse(request).success) go(here, 'e', 'error')
  try {
    await withAttendeeDb(me.id, (tx) => tx.execute(sql`select message_send(${request}::uuid, ${String(formData.get('body') ?? '').slice(0, 1100)})`))
  } catch (error) {
    go(here, 'e', networkingErrorCode(error))
  }
  go(here, 'ok', 'sent')
}

export async function blockAttendee(formData: FormData) {
  const { me, slug, here } = await begin(formData)
  const target = String(formData.get('target') ?? '')
  if (!uuid.safeParse(target).success) go(here, 'e', 'error')
  await withAttendeeDb(me.id, (tx) => tx.execute(sql`select attendee_block(${target}::uuid)`))
  go(`/e/${slug}/messages`, 'ok', 'block')
}

export async function reportAttendee(formData: FormData) {
  const { me, here } = await begin(formData)
  const target = String(formData.get('target') ?? '')
  const request = String(formData.get('request') ?? '')
  if (!uuid.safeParse(target).success) go(here, 'e', 'error')
  await withAttendeeDb(me.id, (tx) => tx.execute(sql`select attendee_report(${target}::uuid, ${uuid.safeParse(request).success ? request : null}::uuid, ${String(formData.get('reason') ?? '').slice(0, 500)})`))
  go(here, 'ok', 'reported')
}
