'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowCounterClockwise, CheckCircle, DownloadSimple, ImageSquare, Warning, XCircle } from '@phosphor-icons/react'
import Link from 'next/link'
import { cropRect } from '@/lib/qr-studio/core'
import { DEFAULT_DESIGN, LIMITS, normaliseDesign, renderDesign, type Design } from '@/lib/qr-studio/design'
import { MAX_FILE_BYTES, sniffImage, toLuminance, withinPixelCap, workingSize } from '@/lib/qr-studio/image'
import { adviceFor, canExport, currentResult, statusText, validate, type Stamped } from '@/lib/qr-studio/validate'

type Photo = { lum: Float32Array; w: number; h: number; canvas: HTMLCanvasElement }
type View = 'photo' | 'original' | 'classic'

const STORE_KEY = 'scanme.qr-studio.design.v1' // design settings only, never the photo
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const

const toImageData = (r: { rgba: Uint8ClampedArray; w: number; h: number }) => new ImageData(new Uint8ClampedArray(r.rgba), r.w, r.h)

function Slider({ label, value, min, max, step, onChange, show }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; show: (v: number) => string }) {
  return (
    <label className="field-label !gap-1.5">
      <span className="flex items-baseline justify-between"><span>{label}</span><span className="text-xs font-normal text-[var(--muted)]">{show(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-6 w-full accent-[var(--accent)]" />
    </label>
  )
}

/**
 * QR Studio. The destination `url` comes from the server and is the only thing ever encoded: nothing in
 * this component (or in a saved design) can change it. The photo stays in this browser tab.
 */
export function QrStudio({ url, photoLocked = false }: { url: string; photoLocked?: boolean }) {
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('photo')
  const [version, setVersion] = useState(0) // bumped by EVERY edit; results carry the version they were made for
  const [result, setResult] = useState<Stamped | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const designRef = useRef(design)
  const versionRef = useRef(0)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)

  useEffect(() => { designRef.current = design }, [design])
  useEffect(() => { versionRef.current = version }, [version])

  const edit = useCallback((patch: Partial<Design>) => {
    setDesign((d) => normaliseDesign({ ...d, ...patch }))
    setVersion((v) => v + 1)
  }, [])

  // Device-local save of the settings (not the picture). Works without it if storage is blocked.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load of saved settings after mount (server render has no localStorage)
      if (raw) { setDesign(normaliseDesign(JSON.parse(raw))); setVersion((v) => v + 1) }
    } catch { /* storage blocked or corrupt: start from defaults */ }
  }, [])
  useEffect(() => {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(design)) } catch { /* storage blocked: fine */ }
  }, [design])

  const rendered = useMemo(() => renderDesign(url, design, photo), [url, design, photo])
  const classic = useMemo(() => (view === 'classic' ? renderDesign(url, { ...design, style: 'classic' }, null) : null), [url, design, view])
  const showPhotoStyle = design.style === 'photo' && !!photo

  // Validate the CURRENT design after edits settle. Decoder code is loaded only now, on this page.
  // A newer edit cancels an older run, and a result for an older version is never shown (currentResult).
  useEffect(() => {
    const v = version
    let stop = false
    const timer = window.setTimeout(async () => {
      setResult({ designVersion: v, state: 'checking' })
      try {
        const { decoders, jpeg } = await import('./decoders')
        const res = await validate({ rgba: rendered.rgba, w: rendered.w, h: rendered.h }, url, decoders, jpeg, () => stop || versionRef.current !== v)
        if (res && !stop) setResult({ designVersion: v, state: 'done', ...res })
      } catch {
        if (!stop) setResult({ designVersion: v, state: 'done', passed: 0, total: 1, results: [] })
      }
    }, 500)
    return () => { stop = true; window.clearTimeout(timer) }
  }, [rendered, version, url])

  const current = currentResult(version, result)
  const allowDownload = canExport(version, result)
  const proLocked = photoLocked && design.style === 'photo' // UI gate only: processing is on the device
  const canDownload = allowDownload && !proLocked

  // Preview canvas.
  useEffect(() => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    if (view === 'original' && photo) {
      c.width = c.height = rendered.w
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      const { side, x0, y0 } = cropRect(photo.w, photo.h, design.zoom, design.panX, design.panY)
      ctx.drawImage(photo.canvas, x0, y0, side, side, 0, 0, c.width, c.height)
    } else {
      const r = view === 'classic' && classic ? classic : rendered
      c.width = r.w; c.height = r.h
      ctx.putImageData(toImageData(r), 0, 0)
    }
  }, [view, photo, design.zoom, design.panX, design.panY, rendered, classic])

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    if (file.size > MAX_FILE_BYTES) return setError('That picture is too large. Choose one under 25 MB.')
    const kind = sniffImage(new Uint8Array(await file.slice(0, 16).arrayBuffer()))
    if (!kind || (file.type && file.type !== MIME[kind])) return setError('Please choose a JPEG, PNG or WebP picture.')
    let bmp: ImageBitmap
    try { bmp = await createImageBitmap(file) } catch { return setError('That picture could not be opened. Try a different one.') }
    if (!withinPixelCap(bmp.width, bmp.height)) { bmp.close(); return setError('That picture is too many pixels (over 40 megapixels). Choose a smaller one.') }
    const { w, h } = workingSize(bmp.width, bmp.height)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) { bmp.close(); return setError('Your browser cannot process pictures here.') }
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    setPhoto({ lum: toLuminance(ctx.getImageData(0, 0, w, h).data, w, h), w, h, canvas })
    setView('photo')
    edit({ style: 'photo', zoom: 1, panX: 0, panY: 0 })
  }

  // Drag to move the picture; two fingers to zoom.
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !photo || !showPhotoStyle || view === 'classic') return
    const now = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, now)
    const d = designRef.current
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (!pinch.current) pinch.current = { dist, zoom: d.zoom }
      else edit({ zoom: pinch.current.zoom * (dist / pinch.current.dist) })
      return
    }
    const box = e.currentTarget.getBoundingClientRect()
    const { side } = cropRect(photo.w, photo.h, d.zoom)
    const perPx = side / box.width // source pixels per screen pixel
    const roomX = (photo.w - side) / 2, roomY = (photo.h - side) / 2
    edit({
      panX: roomX > 0.5 ? d.panX - ((now.x - prev.x) * perPx) / roomX : d.panX,
      panY: roomY > 0.5 ? d.panY - ((now.y - prev.y) * perPx) / roomY : d.panY,
    })
  }

  function download() {
    if (!canDownload) return
    const c = document.createElement('canvas')
    c.width = rendered.w; c.height = rendered.h
    c.getContext('2d')?.putImageData(toImageData(rendered), 0, 0)
    c.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'scanme-qr.png' // no name in the file name
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    }, 'image/png')
  }

  const advice = adviceFor(showPhotoStyle ? 'photo' : 'classic', current)
  const status = statusText(current)
  const ok = allowDownload
  const bad = current?.state === 'done' && !ok
  const tab = (key: View, label: string, disabled = false) => (
    <button key={key} type="button" disabled={disabled} aria-pressed={view === key} onClick={() => setView(key)} className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-bold disabled:opacity-40 ${view === key ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--muted)] hover:bg-[var(--surface-muted)]'}`}>{label}</button>
  )

  const controls = (
    <section aria-label="Design controls" className="soft-card grid content-start gap-4 p-4 sm:p-5 lg:order-1">
      <div className="grid gap-2">
        <label className="action-secondary cursor-pointer" htmlFor="qr-photo"><ImageSquare size={18} />{photo ? 'Change picture' : 'Choose a picture'}</label>
        <input id="qr-photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        <p className="text-xs leading-5 text-[var(--muted)]">Your photo stays on this device. It is not uploaded or saved on our servers.</p>
        {error && <p role="alert" className="text-sm font-semibold text-[var(--danger)]">{error}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Style">
        <button type="button" aria-pressed={design.style === 'classic'} onClick={() => edit({ style: 'classic' })} className={design.style === 'classic' ? 'action-primary' : 'action-secondary'}>Classic</button>
        <button type="button" aria-pressed={design.style === 'photo'} onClick={() => edit({ style: 'photo' })} className={design.style === 'photo' ? 'action-primary' : 'action-secondary'}>Photo{photoLocked && <span className="plan-badge ml-2 !bg-[var(--deep)] !text-[var(--lime)]">Pro</span>}</button>
      </div>
      <fieldset disabled={!showPhotoStyle} className="grid gap-4 disabled:opacity-50">
        <legend className="sr-only">Picture and code settings</legend>
        <Slider label="Zoom" value={design.zoom} min={LIMITS.zoom[0]} max={LIMITS.zoom[1]} step={0.01} onChange={(zoom) => edit({ zoom })} show={(v) => `${v.toFixed(2)}x`} />
        <Slider label="Position, left and right" value={design.panX} min={-1} max={1} step={0.01} onChange={(panX) => edit({ panX })} show={(v) => v.toFixed(2)} />
        <Slider label="Position, up and down" value={design.panY} min={-1} max={1} step={0.01} onChange={(panY) => edit({ panY })} show={(v) => v.toFixed(2)} />
        <Slider label="Brightness" value={design.brightness} min={LIMITS.brightness[0]} max={LIMITS.brightness[1]} step={0.01} onChange={(brightness) => edit({ brightness })} show={(v) => v.toFixed(2)} />
        <Slider label="Contrast" value={design.contrast} min={LIMITS.contrast[0]} max={LIMITS.contrast[1]} step={0.01} onChange={(contrast) => edit({ contrast })} show={(v) => v.toFixed(2)} />
        <Slider label="Image detail" value={design.detail} min={0} max={100} step={1} onChange={(detail) => edit({ detail })} show={(v) => (v >= 67 ? 'fine' : v >= 34 ? 'medium' : 'bold')} />
        <Slider label="QR strength" value={design.strength} min={0} max={100} step={1} onChange={(strength) => edit({ strength })} show={(v) => (v >= 50 ? 'stronger' : 'lighter')} />
        <details className="rounded-lg border border-[var(--line)] p-3">
          <summary className="cursor-pointer text-sm font-bold">Advanced</summary>
          <div className="mt-3 grid gap-3">
            <label className="field-label">Code version
              <select className="field-select" value={design.version} onChange={(e) => edit({ version: Number(e.target.value) })}>
                <option value={0}>Automatic (version 7)</option>
                {[5, 6, 7, 8, 9, 10, 11, 12].map((v) => <option key={v} value={v}>Version {v}</option>)}
              </select>
            </label>
            <p className="text-xs leading-5 text-[var(--muted)]">A bigger version gives the picture more detail but makes each square smaller when printed. If your link is too long for the chosen version, the smallest one that fits is used.</p>
            <label className="field-label">Dither method
              <select className="field-select" value={design.dither} onChange={(e) => edit({ dither: e.target.value === 'bayer' ? 'bayer' : 'fs' })}>
                <option value="fs">Smooth (Floyd–Steinberg)</option>
                <option value="bayer">Patterned (Bayer)</option>
              </select>
            </label>
          </div>
        </details>
      </fieldset>
    </section>
  )

  const preview = (
    <section aria-label="Preview" className="sticky top-16 z-20 -mx-4 grid gap-2 bg-[var(--page)] px-4 pb-2 pt-1 sm:-mx-7 sm:px-7 lg:static lg:order-2 lg:m-0 lg:bg-transparent lg:p-0">
      <div role="group" aria-label="What to show" className="flex gap-1 rounded-xl bg-[var(--surface-strong)] p-1 ring-1 ring-[var(--line)]">
        {tab('original', 'Original', !photo)}{tab('photo', design.style === 'photo' ? 'Photo QR' : 'Your QR')}{tab('classic', 'Classic')}
      </div>
      <div
        className="mx-auto w-full max-w-[560px] touch-none select-none rounded-xl bg-white p-2 ring-1 ring-[var(--line)]"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }) }}
        onPointerUp={(e) => { pointers.current.delete(e.pointerId); pinch.current = null }}
        onPointerCancel={(e) => { pointers.current.delete(e.pointerId); pinch.current = null }}
        onPointerMove={onPointerMove}
      >
        <canvas ref={canvasRef} role="img" aria-label={view === 'original' ? 'Your picture, cropped' : `QR code that opens ${url}`} className="mx-auto block h-auto max-h-[38dvh] w-auto max-w-full [image-rendering:pixelated] lg:max-h-none lg:w-full" />
      </div>
      {showPhotoStyle && view !== 'classic' && <p className="text-center text-xs text-[var(--muted)]">Drag the picture to move it. Pinch with two fingers to zoom.</p>}
      {design.style === 'photo' && !photo && <p className="text-center text-xs text-[var(--muted)]">Choose a picture to turn into your code. Until then this is your standard code.</p>}
    </section>
  )

  const checks = (
    <section aria-label="Checks and download" className="soft-card grid content-start gap-4 p-4 sm:p-5 lg:order-3">
      <div aria-live="polite" className="grid gap-1">
        <p className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--muted)]">Test result</p>
        <p className={`flex items-center gap-2 text-lg font-extrabold ${bad ? 'text-[var(--danger)]' : ''}`}>
          {ok ? <CheckCircle size={22} weight="fill" className="text-[var(--accent)]" /> : bad ? <XCircle size={22} weight="fill" /> : null}
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </p>
        <p className="text-xs leading-5 text-[var(--muted)]">Our software test reads the code in {current?.total ?? 8} simulated conditions (small, blurry, tilted, low contrast, JPEG). It does not replace trying it with your own phone, and it cannot promise how every phone, print or surface will behave.</p>
      </div>
      {current?.state === 'done' && current.results && current.results.length > 0 && (
        <ul className="grid gap-1 text-sm">{current.results.map((r) => <li key={r.name} className="flex items-center justify-between gap-2"><span>{r.name}</span><span className={r.pass ? 'font-bold text-[var(--accent)]' : 'font-bold text-[var(--danger)]'}>{r.pass ? 'read' : 'not read'}</span></li>)}</ul>
      )}
      {rendered.note && <p className="flex gap-2 text-sm text-[var(--warning)]"><Warning size={18} className="mt-0.5 shrink-0" />{rendered.note}</p>}
      {bad && (
        <div role="alert" className="grid gap-2 rounded-lg bg-[var(--surface-muted)] p-3 text-sm">
          <p className="font-bold">This design needs improvement before you can download it.</p>
          <ul className="list-disc pl-5 leading-6">{advice.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
      {proLocked && <p role="note" className="rounded-lg bg-[var(--surface-muted)] p-3 text-sm leading-6">Photo QR is part of Pro. You can try it here; downloading needs Pro. <Link href="/plans" className="font-bold text-[var(--accent)] underline">Compare plans</Link></p>}
      <button type="button" onClick={() => edit({ ...DEFAULT_DESIGN, style: 'classic' })} className="action-secondary"><ArrowCounterClockwise size={18} />Reset to standard QR</button>
      <div className="grid gap-1">
        <p className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--muted)]">Link in the code</p>
        <p className="break-all rounded-lg bg-[var(--surface-muted)] p-2 text-xs">{url}</p>
        <p className="text-xs leading-5 text-[var(--muted)]">This is fixed by your account. The picture can never change where the code goes. Check it is your real address before printing.</p>
      </div>
    </section>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)_300px] lg:items-start lg:gap-6">
      {preview}
      {controls}
      {checks}
      <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 order-last -mx-4 flex items-center gap-3 border-t border-[var(--line)] bg-[var(--page)] px-4 py-3 sm:-mx-7 sm:px-7 lg:hidden">
        <p className="min-w-0 flex-1 truncate text-sm font-bold">{status.charAt(0).toUpperCase() + status.slice(1)}</p>
        <button type="button" onClick={download} disabled={!canDownload} className="action-primary shrink-0 disabled:opacity-40"><DownloadSimple size={18} weight="bold" />Download PNG</button>
      </div>
      <div className="hidden lg:order-4 lg:col-start-3 lg:block">
        <button type="button" onClick={download} disabled={!canDownload} className="action-primary w-full disabled:opacity-40"><DownloadSimple size={18} weight="bold" />Download PNG</button>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{proLocked ? 'Downloading a Photo QR needs Pro. The Classic code downloads on any plan.' : allowDownload ? 'Saved as scanme-qr.png: white background, whole-pixel squares and a 4-square quiet border.' : 'Download unlocks when this exact design passes every test.'}</p>
      </div>
    </div>
  )
}
