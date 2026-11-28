'use client'

import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react'

type Tone = 'ok' | 'error'
type Toast = { id: number; text: string; tone: Tone }
const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {})

/** Show a short confirmation after an action: `const toast = useToast(); toast('Archived')`. */
export const useToast = () => useContext(ToastContext)

/**
 * Messages for `?done=<key>` on a redirect from a server action, so plain server forms get the same
 * confirmation as client actions. Unknown keys show nothing.
 */
const DONE: Record<string, string> = {
  saved: 'Changes saved',
  checked_in: 'Checked in',
  checked_out: 'Check-in removed',
  removed: 'Attendee removed. Their place is free again.',
  added: 'Added',
  link: 'Personal link created. Copy it from the box above.',
  reported: 'Thank you. Your report has been sent to ScanMe for review.',
  blocked: 'Blocked. You can no longer find or message each other.',
  unblocked: 'Unblocked',
  cancelled: 'Event cancelled',
  deleted: 'Deleted',
  photo: 'Photo updated',
  nickname: 'Nickname saved',
}

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(0)
  const toast = useCallback((text: string, tone: Tone = 'ok') => {
    const id = ++next.current
    setToasts((list) => [...list.slice(-2), { id, text, tone }])
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 7000)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Suspense fallback={null}><DoneParam toast={toast} /></Suspense>
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] grid justify-items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm font-bold shadow-[var(--shadow)] ${t.tone === 'error' ? 'border-[var(--danger,#b4442f)] bg-[var(--surface-strong)] text-[var(--ink)]' : 'border-[var(--line)] bg-[var(--deep)] text-white'}`}>
            {t.tone === 'error' ? <WarningCircle size={18} weight="bold" className="mt-px shrink-0 text-[var(--danger,#b4442f)]" /> : <CheckCircle size={18} weight="bold" className="mt-px shrink-0 text-[var(--lime)]" />}
            <span>{t.text}</span>
            <button type="button" aria-label="Dismiss" className="-mr-1 ml-1 opacity-70 hover:opacity-100" onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Reads ?done=, shows its message once and removes it from the address so a refresh doesn't repeat it. */
function DoneParam({ toast }: { toast: (text: string) => void }) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const done = params.get('done')
  useEffect(() => {
    if (!done) return
    if (DONE[done]) toast(DONE[done])
    const rest = new URLSearchParams(params)
    rest.delete('done')
    const qs = rest.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [done, params, pathname, router, toast])
  return null
}
