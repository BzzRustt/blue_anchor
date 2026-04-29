import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdminAuthenticated } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/types/database'

// ─── GET — return current profile for the edit form ───────────────────────────

export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ success: false }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data } = await supabase.from('profiles').select('*').maybeSingle()

  return NextResponse.json({ profile: data as Profile | null })
}

// ─── POST — validate + save the profile ──────────────────────────────────────

const bodySchema = z
  .object({
    name: z.string().min(1, 'Name is required.').max(100),
    photo_url: z.string().max(500).optional(),
    bio: z.string().max(500).optional(),
    poll_type: z.enum(['slider', 'multiple_choice', 'open_text']),
    poll_question: z.string().min(1, 'Poll question is required.').max(200),
    poll_options: z.array(z.string().max(100)).optional(),
    note_intro: z.string().max(1000).optional(),
    instagram: z.string().max(100).optional(),
    survey_link: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    const urlFields = [
      { key: 'photo_url' as const, label: 'Photo URL' },
      { key: 'survey_link' as const, label: 'Survey link' },
    ]
    for (const { key, label } of urlFields) {
      const val = data[key]?.trim()
      if (val) {
        try {
          new URL(val)
        } catch {
          ctx.addIssue({
            code: 'custom',
            message: `${label} must be a valid URL.`,
            path: [key],
          })
        }
      }
    }

    if (data.poll_type === 'multiple_choice') {
      const valid = (data.poll_options ?? []).filter((o) => o.trim().length > 0)
      if (valid.length < 2) {
        ctx.addIssue({
          code: 'custom',
          message: 'Multiple choice requires at least 2 options.',
          path: ['poll_options'],
        })
      }
    }
  })

// ─── PATCH — toggle test_mode only ───────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ success: false }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request.' }, { status: 400 })
  }

  const parsed = z.object({ test_mode: z.boolean() }).safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: 'Invalid input.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: existing } = await supabase.from('profiles').select('id').maybeSingle()
  const row = existing as Pick<Profile, 'id'> | null

  if (!row) {
    return NextResponse.json(
      { success: false, message: 'No profile found.' },
      { status: 404 }
    )
  }

  const { error } = await supabase
    .from('profiles')
    .update({ test_mode: parsed.data.test_mode })
    .eq('id', row.id)

  if (error) {
    console.error('[api/profile] patch error:', error.message)
    return NextResponse.json({ success: false, message: 'Something went wrong.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// ─── POST — validate + save the profile ──────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ success: false }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid input.'
    return NextResponse.json({ success: false, message }, { status: 400 })
  }

  const d = parsed.data

  const update = {
    name: d.name.trim(),
    photo_url: d.photo_url?.trim() || null,
    bio: d.bio?.trim() || null,
    poll_type: d.poll_type,
    poll_question: d.poll_question.trim(),
    poll_options:
      d.poll_type === 'multiple_choice'
        ? (d.poll_options ?? []).map((o) => o.trim()).filter(Boolean)
        : null,
    note_intro: d.note_intro?.trim() || null,
    instagram: d.instagram?.trim() || null,
    survey_link: d.survey_link?.trim() || null,
  }

  const supabase = createAdminClient()

  // Fetch the single profile row's id, then update by id.
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .maybeSingle()

  const row = existing as Pick<Profile, 'id'> | null

  if (!row) {
    return NextResponse.json(
      { success: false, message: 'No profile found. Seed the profile row first.' },
      { status: 404 }
    )
  }

  const { error } = await supabase.from('profiles').update(update).eq('id', row.id)

  if (error) {
    console.error('[api/profile] update error:', error.message)
    return NextResponse.json({ success: false, message: 'Something went wrong.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
