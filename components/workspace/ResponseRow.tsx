'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { Archive, ArrowCounterClockwise, Check, EnvelopeSimple, Flag, Prohibit, X } from '@phosphor-icons/react'
import { archiveResponse, blockSender, markResponseRead, markResponseUnread, reportResponse, unarchiveResponse, unblockSender } from '@/app/app/actions'
import { useToast } from '@/components/Toaster'
import type { InboxItem } from '@/lib/inbox'

const modeName = (mode: string | null) => (mode ? mode.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()) : 'Mode')
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' })
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

/**
 * One inbox response: a compact row that opens a dialog with the full answers and every action.
 * Opening an unread response marks it read. Actions confirm with a toast; Block asks first.
 */
export function ResponseRow({ item }: { item: InboxItem }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [confirmBlock, setConfirmBlock] = useState(false)
  const acted = useRef(false)
  const unread = !item.readAt
  const first = item.answers[0]?.[1] ?? 'No written answer'

  const run = (action: (fd: FormData) => Promise<void>, message: string, close = false) => start(async () => {
    if (message) acted.current = true
    const fd = new FormData()
    fd.set('responseId', item.id)
    try {
      await action(fd)
      if (message) toast(message)
      if (close) dialog.current?.close()
    } catch {
      toast('That did not work. Please try again.', 'error')
    }
  })

  function open() {
    setConfirmBlock(false)
    acted.current = false
    dialog.current?.showModal()
  }
  // Marked read when the dialog closes, not when it opens: in the Unread view the row would
  // otherwise vanish (and take the open dialog with it) the moment it was opened.
  function closed() {
    if (unread && !acted.current) run(markResponseRead, '')
  }

  const repeat = item.fromSame > 1 ? `Same visitor · ${ordinal(item.nth)} of ${item.fromSame}` : null

  return (
    <li className={unread ? 'bg-[var(--accent-soft)]' : ''}>
      <button type="button" onClick={open} className="grid w-full gap-1 p-4 text-left hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] sm:p-5">
        <span className="flex flex-wrap items-center gap-2">
          {unread && <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />}
          <span className={unread ? 'font-extrabold' : 'font-semibold text-[var(--muted)]'}>{item.campaignName ?? 'Deleted Mode'}</span>
          {unread && <span className="status-live">New</span>}
          {item.flagged && <span className="status-draft">Reported</span>}
          {item.blocked && <span className="status-draft">Sender blocked</span>}
          {repeat && <span className="rounded-md border border-[var(--line)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--muted)]" title={`Visitor ${item.visitor} has sent ${item.fromSame} responses`}>{repeat}</span>}
        </span>
        <span className={`line-clamp-2 text-sm leading-6 ${unread ? 'text-[var(--ink)]' : 'text-[var(--muted)]'}`}>{first}</span>
        <span className="text-xs text-[var(--muted)]">{modeName(item.mode)} · Visitor {item.visitor} · <time dateTime={item.submittedAt}>{when(item.submittedAt)}</time></span>
      </button>

      <dialog ref={dialog} onClose={closed} aria-labelledby={titleId} className="w-[min(560px,calc(100%-24px))] rounded-[18px] border border-[var(--line)] bg-[var(--page)] p-0 text-[var(--ink)] shadow-[var(--shadow)] backdrop:bg-[#0d231ab5]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-extrabold tracking-[-.03em]">{item.campaignName ?? 'Deleted Mode'}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{modeName(item.mode)} · Visitor {item.visitor} · {when(item.submittedAt)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.flagged && <span className="status-draft">Reported</span>}
              {item.blocked && <span className="status-draft">Sender blocked</span>}
              {repeat && <span className="rounded-md border border-[var(--line)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--muted)]">{repeat}</span>}
            </div>
          </div>
          <button type="button" aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--surface-muted)]" onClick={() => dialog.current?.close()}><X size={18} /></button>
        </div>

        <dl className="grid max-h-[50vh] gap-4 overflow-y-auto p-5">
          {item.answers.length ? item.answers.map(([question, answer], index) => (
            <div key={index} className="grid gap-1">
              <dt className="text-xs font-bold uppercase tracking-[.08em] text-[var(--muted)]">{question || 'Answer'}</dt>
              <dd className="whitespace-pre-wrap break-words text-[15px] leading-6">{answer}</dd>
            </div>
          )) : <p className="text-sm text-[var(--muted)]">No written answer.</p>}
        </dl>

        <div className="border-t border-[var(--line)] p-5">
          {confirmBlock ? (
            <div className="grid gap-3">
              <p className="text-sm leading-6"><strong>Block this visitor?</strong> Their browser will not be able to send you anything else, and their responses move to Blocked. You can unblock them later from the Blocked list.</p>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="action-secondary" onClick={() => setConfirmBlock(false)}>Cancel</button>
                <button type="button" disabled={pending} className="action-danger" onClick={() => run(blockSender, 'Visitor blocked. Find them under Blocked.', true)}><Prohibit size={17} />Block visitor</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2" aria-busy={pending}>
              {item.readAt && !item.archived && <button type="button" disabled={pending} className="action-secondary !min-h-10 text-sm" onClick={() => run(markResponseUnread, 'Marked as unread', true)}><EnvelopeSimple size={17} />Mark unread</button>}
              {!item.archived && <button type="button" disabled={pending} className="action-secondary !min-h-10 text-sm" onClick={() => run(archiveResponse, 'Archived', true)}><Archive size={17} />Archive</button>}
              {item.archived && !item.blocked && <button type="button" disabled={pending} className="action-secondary !min-h-10 text-sm" onClick={() => run(unarchiveResponse, 'Moved back to your inbox', true)}><ArrowCounterClockwise size={17} />Unarchive</button>}
              {!item.flagged && <button type="button" disabled={pending} className="action-quiet !min-h-10 text-sm" onClick={() => run(reportResponse, 'Reported. It stays here marked Reported.')}><Flag size={17} />Report</button>}
              {item.blocked
                ? <button type="button" disabled={pending} className="action-quiet !min-h-10 text-sm" onClick={() => run(unblockSender, 'Unblocked. They can respond again.', true)}><Check size={17} />Unblock</button>
                : <button type="button" disabled={pending} className="action-quiet !min-h-10 text-sm" onClick={() => setConfirmBlock(true)}><Prohibit size={17} />Block</button>}
            </div>
          )}
        </div>
      </dialog>
    </li>
  )
}
