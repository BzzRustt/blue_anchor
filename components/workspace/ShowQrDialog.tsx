'use client'

import Image from 'next/image'
import { useId, useRef, useState } from 'react'
import { Check, Copy, DownloadSimple, Scan, ShareNetwork, X } from '@phosphor-icons/react'

/**
 * The spec keeps the full QR hidden until "Show QR". Native <dialog>: showModal() traps focus,
 * Escape closes, focus returns to the trigger. The QR image is fetched from /app/qr.png on first open,
 * so Home never pays for it.
 */
export function ShowQrDialog({ url, code, triggerClassName }: { url: string; code: string; triggerClassName: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [copied, setCopied] = useState(false)
  const [opened, setOpened] = useState(false)
  const qr = `/app/qr.png?v=${encodeURIComponent(code)}`

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => { setOpened(true); dialog.current?.showModal() }}><Scan size={18} weight="bold" />Show QR</button>
      <dialog ref={dialog} aria-labelledby={titleId} className="w-[min(460px,calc(100%-24px))] rounded-[14px] border border-[var(--line)] bg-[var(--surface-strong)] p-6 text-[var(--ink)] shadow-[var(--shadow)] backdrop:bg-[#17251a88]">
        <div className="flex items-start justify-between gap-3">
          <div><h2 id={titleId} className="text-2xl font-extrabold tracking-[-.04em]">Your ScanMe QR</h2><p className="mt-1 text-sm text-[var(--muted)]">Permanent code <strong className="text-[var(--ink)]">{code}</strong>. It opens whichever Mode is active.</p></div>
          <button type="button" aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--surface-muted)]" onClick={() => dialog.current?.close()}><X size={18} /></button>
        </div>
        <div className="my-5 grid place-items-center rounded-xl bg-[var(--surface-muted)] p-5"><div className="aspect-square w-full max-w-[260px] rounded-lg bg-white p-3">{opened && <Image src={qr} alt={`QR code for ${url}`} width={720} height={720} unoptimized className="h-auto w-full" />}</div></div>
        <p className="break-all text-center text-xs text-[var(--muted)]">{url}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={copy} className="action-secondary">{copied ? <Check size={18} weight="bold" /> : <Copy size={18} />}{copied ? 'Copied' : 'Copy link'}</button>
          {/* Share sheet where the browser has one (phones); otherwise it falls back to copying. */}
          <button type="button" onClick={() => ('share' in navigator ? navigator.share({ title: 'My ScanMe', url }).catch(() => {}) : copy())} className="action-secondary"><ShareNetwork size={18} />Share</button>
          <a href={qr} download={`scanme-${code}.png`} className="action-primary"><DownloadSimple size={18} weight="bold" />Download PNG</a>
        </div>
      </dialog>
    </>
  )
}
