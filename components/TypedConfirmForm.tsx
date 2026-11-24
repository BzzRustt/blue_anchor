'use client'

import { useId, useRef, useState, type ReactNode } from 'react'

/**
 * For actions that can't be undone (cancelling an event): step one explains the consequences,
 * step two only enables the button once the exact name is typed. The server checks the name too.
 */
export function TypedConfirmForm({ action, phrase, title, consequences, confirmLabel, triggerLabel, children }: {
  action: (formData: FormData) => void | Promise<void>
  phrase: string
  title: string
  consequences: string[]
  confirmLabel: string
  triggerLabel: ReactNode
  children?: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const inputId = useId()
  const [typed, setTyped] = useState('')
  const [step, setStep] = useState<1 | 2>(1)
  const matches = typed.trim() === phrase.trim()

  return (
    <>
      <button type="button" className="action-danger" onClick={() => { setStep(1); setTyped(''); dialog.current?.showModal() }}>{triggerLabel}</button>
      <dialog ref={dialog} aria-labelledby={titleId} className="w-[min(480px,calc(100%-24px))] rounded-[21px] border border-[var(--line)] bg-[var(--page)] p-6 text-[var(--ink)] shadow-[var(--shadow)] backdrop:bg-[#0d231ab5]">
        <h2 id={titleId} className="text-xl font-extrabold tracking-[-.03em]">{title}</h2>
        {step === 1 ? (
          <>
            <p className="mt-2 text-sm font-bold">This can’t be undone. If you continue:</p>
            <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm leading-6 text-[var(--muted)]">{consequences.map((c) => <li key={c}>{c}</li>)}</ul>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" className="action-secondary" onClick={() => dialog.current?.close()}>Keep it</button>
              <button type="button" className="action-danger" onClick={() => setStep(2)}>I understand, continue</button>
            </div>
          </>
        ) : (
          <form action={action} className="mt-3 grid gap-3">
            {children}
            <label htmlFor={inputId} className="field-label">Type <strong className="font-mono">{phrase}</strong> to confirm
              <input id={inputId} name="confirmName" className="field-input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </label>
            <div className="mt-3 flex flex-wrap justify-end gap-3">
              <button type="button" className="action-secondary" onClick={() => dialog.current?.close()}>Keep it</button>
              <button className="action-danger" disabled={!matches}>{confirmLabel}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  )
}
