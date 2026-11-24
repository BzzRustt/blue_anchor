'use client'

import Link from 'next/link'
import { useId, useRef } from 'react'
import { Eye, Play } from '@phosphor-icons/react'
import { toggleCode } from '@/app/app/actions'

/**
 * Turning sharing on shows, before anything goes public, which Mode visitors will get and the
 * question they will be asked, with a way to preview or change it first.
 */
export function GoLiveDialog({ codeId, modeName, modeKey, question }: { codeId: string; modeName: string; modeKey: string; question: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  return (
    <>
      <button type="button" className="action-secondary !border-[var(--lime)] !bg-[var(--lime)] !text-[var(--on-lime)]" onClick={() => dialog.current?.showModal()}><Play size={18} weight="bold" />Turn sharing on</button>
      <dialog ref={dialog} aria-labelledby={titleId} className="w-[min(460px,calc(100%-24px))] rounded-[21px] border border-[var(--line)] bg-[var(--page)] p-6 text-[var(--ink)] shadow-[var(--shadow)] backdrop:bg-[#0d231ab5]">
        <h2 id={titleId} className="text-xl font-extrabold tracking-[-.03em]">Ready to go live?</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Anyone who scans your QR will see your <strong className="text-[var(--ink)]">{modeName}</strong> page{question ? ' and be asked:' : '.'}</p>
        {question && <p className="mt-3 rounded-xl bg-[var(--surface-muted)] p-3 text-sm font-bold">“{question}”</p>}
        <p className="mt-3 text-xs text-[var(--muted)]">You can change this any time in Modes, or pause sharing again from Home.</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Link href={`/app/modes/${modeKey}`} className="action-quiet">Change it first</Link>
          <Link href={`/app/modes/${modeKey}/preview`} className="action-secondary"><Eye size={17} />Preview</Link>
          <form action={toggleCode}><input type="hidden" name="codeId" value={codeId} /><input type="hidden" name="enabled" value="true" /><button className="action-primary"><Play size={17} weight="bold" />Go live</button></form>
        </div>
      </dialog>
    </>
  )
}
