import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdminAuthenticated } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const uuidSchema = z.string().uuid()

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ success: false }, { status: 401 })
  }

  const parsed = uuidSchema.safeParse(params.id)
  if (!parsed.success) {
    return NextResponse.json({ success: false }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('responses')
    .delete()
    .eq('id', parsed.data)

  if (error) {
    console.error('[api/responses/[id]] delete error:', error.message)
    return NextResponse.json({ success: false }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
