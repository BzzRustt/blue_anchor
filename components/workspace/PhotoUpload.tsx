'use client'

import { useState } from 'react'
import { PHOTO_MAX_BYTES } from '@/lib/profile-rules'

/**
 * The photo picker. A file over the limit is refused here, before anything is sent: the server only
 * accepts a few MB per form, so a huge file used to end in a generic "page couldn't load" error.
 * The server still checks the size and the real file type.
 */
export function PhotoUpload({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form action={action} onSubmit={() => setBusy(true)} className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="photo">Choose a photo</label>
        <input
          id="photo" className="field-input !w-auto min-w-0 max-w-full text-sm" type="file" name="photo" accept="image/jpeg,image/png,image/webp" required
          onChange={(e) => {
            const file = e.target.files?.[0]
            setProblem(file && file.size > PHOTO_MAX_BYTES ? `That photo is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${PHOTO_MAX_BYTES / 1048576} MB: choose a smaller one.` : '')
          }}
        />
        <button className="action-primary" disabled={!!problem || busy}>{busy ? 'Uploading…' : 'Upload'}</button>
      </div>
      {problem && <p role="alert" className="text-sm font-semibold text-[var(--danger,#a3392b)]">{problem}</p>}
    </form>
  )
}
