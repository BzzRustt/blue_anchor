'use client'

import { useId, useRef, type ReactNode } from 'react'

interface Props {
  /** The existing server action. It runs only after the person confirms. */
  action: (formData: FormData) => void | Promise<void>
  title: string
  message: string
  confirmLabel: string
  triggerLabel: ReactNode
  triggerClassName: string
  /** 'danger' styles the confirm button as destructive. */
  tone?: 'danger'
  /** Hidden inputs the action needs. */
  children?: ReactNode
}

/**
 * Asks before running a server action that is hard to notice or undo.
 *
 * Uses the native <dialog>: showModal() traps focus, Escape closes it, and closing returns
 * focus to the button that opened it, so there is no custom focus handling to get wrong.
 * The action itself is unchanged: the form still submits the same way, just after a yes.
 */
export function ConfirmForm({ action, title, message, confirmLabel, triggerLabel, triggerClassName, tone, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const titleId = useId()

  return (
    <>
      <form ref={form} action={action}>
        {children}
        <button type="button" className={triggerClassName} onClick={() => dialog.current?.showModal()}>{triggerLabel}</button>
      </form>
      <dialog ref={dialog} aria-labelledby={titleId} className="w-[min(440px,calc(100%-24px))] rounded-[21px] border border-[var(--line)] bg-[var(--page)] p-6 text-[var(--ink)] shadow-[var(--shadow)] backdrop:bg-[#0d231ab5]">
        <h2 id={titleId} className="text-xl font-extrabold tracking-[-.03em]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{message}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" className="action-secondary" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="button" className={tone === 'danger' ? 'action-danger' : 'action-primary'} onClick={() => { dialog.current?.close(); form.current?.requestSubmit() }}>{confirmLabel}</button>
        </div>
      </dialog>
    </>
  )
}
