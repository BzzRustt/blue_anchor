import { networkingWording } from '@/lib/networking'

const DONE: Record<string, string> = {
  saved: 'Saved. Only you can see your saved people.',
  unsaved: 'Removed from your saved people.',
  requested: 'Request sent. They will see it in their Messages.',
  accept: 'Accepted. You can now message each other.',
  decline: 'Declined. They will not be told why.',
  block: 'Blocked. You can no longer find or message each other at this event.',
  sent: 'Sent.',
  reported: 'Thank you. Your report goes to ScanMe, not to the organiser.',
}

/** Result of a networking action, from ?ok= / ?e= codes. Unknown codes never render as text. */
export function NetworkNotice({ ok, e }: { ok?: string; e?: string }) {
  const error = networkingWording(e)
  if (error) return <p role="alert" className="mb-4 rounded-xl border border-[var(--danger)] bg-[var(--surface)] p-3 text-sm">{error}</p>
  const done = ok ? DONE[ok] : undefined
  return done ? <p role="status" className="mb-4 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm font-bold text-[var(--accent-strong)]">{done}</p> : null
}
