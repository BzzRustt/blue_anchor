'use client'

import { ArrowRight, CheckCircle, LockSimple, SpinnerGap } from '@phosphor-icons/react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { VisitorExperience } from '@/lib/product'

type Block = VisitorExperience['blocks'][number]

export function VisitorForm({ slug, blocks }: { slug: string; blocks: Block[] }) {
  const initial = useMemo(() => Object.fromEntries(blocks.map((block) => [block.id, block.type === 'scale' ? block.config.min ?? 1 : ''])), [blocks])
  const [answers, setAnswers] = useState<Record<string, string | number>>(initial)
  const [pending, setPending] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void fetch(`/api/t/${encodeURIComponent(slug)}/scan`, { method: 'POST' }) }, [slug])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const response = await fetch(`/api/t/${encodeURIComponent(slug)}/respond`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers }) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) { setError(payload.error ?? 'Your response could not be sent.'); setPending(false); return }
    setComplete(true)
  }

  if (complete) return <div className="grid min-h-60 place-items-center rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-7 text-center"><div><CheckCircle size={44} weight="fill" className="mx-auto text-[var(--accent)]" /><h2 className="mt-4 text-2xl font-extrabold tracking-[-.045em]">Sent privately</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Thanks for taking a moment to respond. You can close this page now.</p></div></div>

  return <form onSubmit={submit} className="grid gap-5 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">{blocks.map((block) => <Question key={block.id} block={block} value={answers[block.id]} setValue={(value) => setAnswers((current) => ({ ...current, [block.id]: value }))} />)}{error && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_32%,var(--line))] p-3 text-sm text-[var(--danger)]">{error}</p>}<button disabled={pending} className="action-primary w-full">{pending ? <SpinnerGap className="animate-spin" size={19} /> : <ArrowRight size={19} weight="bold" />}{pending ? 'Sending' : 'Send privately'}</button><p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-[var(--faint)]"><LockSimple size={13} />Your response goes only to this profile owner.</p></form>
}

function Question({ block, value, setValue }: { block: Block; value: string | number; setValue: (value: string | number) => void }) {
  const config = block.config
  if (block.type === 'scale') {
    const min = config.min ?? 1
    const max = config.max ?? 10
    return <fieldset><legend className="text-sm font-extrabold">{config.prompt}</legend><div className="mt-3 flex items-center gap-4"><strong className="w-8 text-center text-3xl text-[var(--accent-strong)]">{value}</strong><input className="min-w-0 flex-1" type="range" min={min} max={max} value={Number(value)} onChange={(event) => setValue(Number(event.target.value))} required={block.required} /></div><div className="ml-12 mt-1 flex justify-between text-[10px] font-bold text-[var(--faint)]"><span>{min}</span><span>{max}</span></div></fieldset>
  }
  if (block.type === 'choice' || block.type === 'yes_no' || block.type === 'emoji') {
    const options = block.type === 'yes_no' ? ['Yes', 'No'] : block.type === 'emoji' ? ['🙂', '😍', '🤔', '🔥'] : config.options ?? []
    return <fieldset><legend className="text-sm font-extrabold">{config.prompt}</legend><div className="mt-3 flex flex-wrap gap-2">{options.map((option) => <label key={option} className="cursor-pointer"><input type="radio" className="peer sr-only" name={block.id} value={option} required={block.required} checked={value === option} onChange={() => setValue(option)} /><span className="inline-flex min-h-10 items-center rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 text-sm font-bold peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent-soft)]">{option}</span></label>)}</div></fieldset>
  }
  if (block.type === 'link_out') return <div><p className="text-sm font-extrabold">{config.prompt}</p><a className="action-secondary mt-3 w-full" href={config.placeholder ?? '#'} target="_blank" rel="noreferrer">Open link <ArrowRight size={17} /></a></div>
  return <label className="field-label">{config.prompt}<textarea className="field-textarea min-h-[96px]" value={String(value ?? '')} onChange={(event) => setValue(event.target.value)} required={block.required} maxLength={500} placeholder={config.placeholder ?? 'Write a short answer'} /></label>
}
