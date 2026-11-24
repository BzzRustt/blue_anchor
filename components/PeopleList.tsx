import Link from 'next/link'
import { EventShell } from '@/components/EventShell'
import type { FoundPerson } from '@/lib/networking'

/** `from` is the list's own address, so the person card can link straight back to these results. */
export function PeopleList({ slug, people, empty, questions, from }: { slug: string; people: Pick<FoundPerson, 'id' | 'tag' | 'display_name' | 'answers'>[]; empty: string; questions: { id: string }[]; from?: string }) {
  if (!people.length) return <p className="text-sm text-[var(--muted)]">{empty}</p>
  return (
    <ul className="grid gap-2">
      {people.map((p) => {
        const first = questions.map((q) => p.answers?.[q.id]).find(Boolean)
        return (
          <li key={p.id}>
            <Link href={`/e/${slug}/a/${p.id}${from ? `?from=${encodeURIComponent(from)}` : ''}`} className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 hover:border-[var(--accent)]">
              <span className="rounded-lg bg-[var(--deep)] px-2 py-1 font-mono text-xs font-extrabold text-[var(--on-deep)]">{p.tag}</span>
              <span className="min-w-0">
                <span className="block font-bold">{p.display_name}</span>
                {first && <span className="block truncate text-xs text-[var(--muted)]">{first}</span>}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function SetUpFirst({ slug, name }: { slug: string; name: string }) {
  return (
    <EventShell eyebrow={name} title="Set up your profile first">
      <p className="text-sm leading-6 text-[var(--muted)]">Finding people, saving them and messages are for attendees with an event profile on this device.</p>
      <Link href={`/e/${slug}`} className="action-primary mt-4 w-full justify-center">Go to the event page</Link>
    </EventShell>
  )
}
