'use client'

import { useMemo, useState } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { ResponseRow } from '@/components/workspace/ResponseRow'
import type { InboxItem } from '@/lib/inbox'

/** The inbox list with a search box. Searches the answers, Mode and visitor label already on the page; nothing is sent anywhere. */
export function InboxList({ items }: { items: InboxItem[] }) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => [item.campaignName ?? '', item.mode ?? '', `visitor ${item.visitor}`, ...item.answers.flat()].join(' ').toLowerCase().includes(needle))
  }, [items, q])

  return (
    <div>
      <label className="relative block border-b border-[var(--line)] p-3 sm:p-4">
        <span className="sr-only">Search messages</span>
        <MagnifyingGlass size={18} className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-[var(--muted)] sm:left-7" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages" className="field-input !pl-10" />
      </label>
      {shown.length === 0
        ? <p className="p-8 text-center text-sm text-[var(--muted)]">No messages match &ldquo;{q}&rdquo;.</p>
        : <ul className="divide-y divide-[var(--line)]">{shown.map((item) => <ResponseRow key={item.id} item={item} />)}</ul>}
      <p className="border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--muted)]">{q ? `${shown.length} of ${items.length} messages` : `${items.length} ${items.length === 1 ? 'message' : 'messages'}`}</p>
    </div>
  )
}
