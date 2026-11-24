'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const DirtyContext = createContext(false)

/**
 * A settings form that knows when something has changed. Its Save button stays quiet until then,
 * turns into the bright primary button with "Unsaved changes" once there is something to save, and
 * the browser warns before leaving with unsaved changes.
 */
export function DirtyForm({ action, className, children }: { action: (formData: FormData) => void | Promise<void>; className?: string; children: ReactNode }) {
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  return (
    <DirtyContext.Provider value={dirty}>
      <form action={action} className={className} onInput={() => setDirty(true)} onChange={() => setDirty(true)} onSubmit={() => setDirty(false)}>{children}</form>
    </DirtyContext.Provider>
  )
}

export function SaveButton({ label = 'Save changes', className = '' }: { label?: string; className?: string }) {
  const dirty = useContext(DirtyContext)
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <button className={dirty ? 'action-primary' : 'action-secondary opacity-70'} aria-describedby={dirty ? 'unsaved-note' : undefined}>{label}</button>
      {dirty
        ? <span id="unsaved-note" role="status" className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--danger)]"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--danger)]" />Unsaved changes</span>
        : <span className="text-sm text-[var(--muted)]">No changes yet</span>}
    </div>
  )
}
