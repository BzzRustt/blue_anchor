import Link from 'next/link'

const TABS = [
  ['event', '', 'Event'],
  ['people', '/people', 'People'],
  ['saved', '/saved', 'Saved'],
  ['messages', '/messages', 'Messages'],
] as const

/** The focused attendee navigation: only what a temporary attendee needs, no account menus. */
export function AttendeeNav({ slug, active, unread = 0 }: { slug: string; active: (typeof TABS)[number][0]; unread?: number }) {
  return (
    // Four equal columns that always fit: on a narrow phone the labels shrink rather than scroll off the edge.
    <nav aria-label="Event" className="-mx-1 mb-5 grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.5fr)] gap-0.5 rounded-full border border-[var(--line)] bg-[var(--surface)] p-1">
      {TABS.map(([key, path, label]) => (
        <Link
          key={key}
          href={`/e/${slug}${path}`}
          aria-current={active === key ? 'page' : undefined}
          className={`min-w-0 truncate whitespace-nowrap rounded-full px-1 py-2 text-center text-[11px] font-extrabold tracking-[-.01em] sm:px-3 sm:text-xs ${active === key ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--muted)]'}`}
        >
          {label}
          {key === 'messages' && unread > 0 && <span className="ml-1 rounded-full bg-[var(--lime)] px-1 text-[10px] text-[var(--on-lime)]"><span className="sr-only">, unread: </span>{unread}</span>}
        </Link>
      ))}
    </nav>
  )
}
