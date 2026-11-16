import Link from 'next/link'

const TABS = [
  ['event', '', 'My event'],
  ['people', '/people', 'Find people'],
  ['saved', '/saved', 'Saved'],
  ['messages', '/messages', 'Messages'],
] as const

/** The focused attendee navigation: only what a temporary attendee needs, no account menus. */
export function AttendeeNav({ slug, active, unread = 0 }: { slug: string; active: (typeof TABS)[number][0]; unread?: number }) {
  return (
    <nav aria-label="Event" className="-mx-1 mb-5 flex gap-1 overflow-x-auto rounded-full border border-[var(--line)] bg-[var(--surface)] p-1">
      {TABS.map(([key, path, label]) => (
        <Link
          key={key}
          href={`/e/${slug}${path}`}
          aria-current={active === key ? 'page' : undefined}
          className={`flex-1 whitespace-nowrap rounded-full px-3 py-2 text-center text-xs font-extrabold ${active === key ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--muted)]'}`}
        >
          {label}
          {key === 'messages' && unread > 0 && <span className="ml-1 rounded-full bg-[var(--lime)] px-1.5 text-[10px] text-[var(--on-lime)]"><span className="sr-only">, unread: </span>{unread}</span>}
        </Link>
      ))}
    </nav>
  )
}
