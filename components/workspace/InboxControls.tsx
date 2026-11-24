'use client'

import { PendingLink, usePendingNav } from '@/components/PendingNav'
import type { InboxFilter } from '@/lib/inbox'

type Props = {
  filter: InboxFilter
  source: string
  counts: Record<InboxFilter, number>
  sources: Array<{ id: string; label: string }>
}

const LABELS: Array<[InboxFilter, string]> = [['all', 'All'], ['unread', 'Unread'], ['archived', 'Archived'], ['blocked', 'Blocked']]

const hrefFor = (filter: InboxFilter, source: string) => {
  const params = new URLSearchParams()
  if (filter !== 'all') params.set('filter', filter)
  if (source) params.set('source', source)
  const qs = params.toString()
  return qs ? `/app?${qs}` : '/app'
}

/** Inbox filters with their counts, and the Mode picker, which applies as soon as it changes. */
export function InboxControls({ filter, source, counts, sources }: Props) {
  const { go } = usePendingNav()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Filter responses" className="flex flex-wrap gap-2">
        {LABELS.filter(([key]) => key !== 'blocked' || counts.blocked > 0 || filter === 'blocked').map(([key, label]) => (
          <PendingLink key={key} href={hrefFor(key, source)} current={filter === key} className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-sm font-bold ${filter === key ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted)] hover:text-[var(--ink)]'}`}>
            {label}
            <span className={`min-w-6 rounded-md px-1.5 text-center text-xs tabular-nums ${filter === key ? 'bg-white/20' : 'bg-[var(--surface-muted)]'}`}>{counts[key]}</span>
          </PendingLink>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <label htmlFor="source" className="text-sm text-[var(--muted)]">Mode</label>
        <select id="source" value={source} onChange={(e) => go(hrefFor(filter, e.target.value))} className="field-select !min-h-10 !w-auto text-sm">
          <option value="">All Modes</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
    </div>
  )
}
