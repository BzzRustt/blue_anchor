import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile } from '@/types/database'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ success: false, message: 'No file provided.' }, { status: 400 })
  }

  // file is a Blob or File here
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json(
      { success: false, message: 'Only JPG, PNG, and WebP images are accepted.' },
      { status: 400 }
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, message: 'Photo must be under 5 MB.' },
      { status: 400 }
    )
  }

  const filename = `profile-photo.${EXT[file.type]}`

  try {
    const supabase = createAdminClient()

    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filename, arrayBuffer, { contentType: file.type, upsert: true })

    if (uploadError) {
      console.error('[api/upload] storage error:', uploadError.message)
      return NextResponse.json(
        { success: false, message: 'Upload failed. Please try again.' },
        { status: 500 }
      )
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filename)
    const publicUrl = urlData.publicUrl

    // Update the profile row with the new URL
    const { data: existing } = await supabase.from('profiles').select('id').maybeSingle()
    const row = existing as Pick<Profile, 'id'> | null

    if (!row) {
      return NextResponse.json(
        { success: false, message: 'No profile found.' },
        { status: 404 }
      )
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ photo_url: publicUrl })
      .eq('id', row.id)

    if (updateError) {
      console.error('[api/upload] update error:', updateError.message)
      return NextResponse.json(
        { success: false, message: 'Something went wrong. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, url: publicUrl })
  } catch (err) {
    console.error('[api/upload] unexpected error:', err)
    return NextResponse.json(
      { success: false, message: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
