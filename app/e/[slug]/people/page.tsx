import type { Metadata } from 'next'
import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { AttendeeNav } from '@/components/AttendeeNav'
import { EventClosed, EventShell } from '@/components/EventShell'
import { NetworkNotice } from '@/components/NetworkNotice'
import { PeopleList, SetUpFirst } from '@/components/PeopleList'
import { withAttendeeDb } from '@/lib/db'
import { formatWhen } from '@/lib/events'
import { attendeeSession, networkingErrorCode, networkingInfo, rowsOf, unreadCount, type FoundPerson } from '@/lib/networking'

export const metadata: Metadata = { title: 'Find people', robots: { index: false, follow: false } }

/** "F-042", "f042", "042", "42": what a badge tag search looks like (anything else is a keyword search). */
const looksLikeTag = (value: string) => /^[a-z]?-?\d{1,4}$/i.test(value.trim())
const normTag = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')
const sameTag = (typed: string, tag: string) => {
  const a = normTag(typed), b = normTag(tag)
  return a === b || (/^\d+$/.test(a) && b.replace(/^[A-Z]/, '').replace(/^0+/, '') === a.replace(/^0+/, ''))
}

/**
 * Badge search, and the full directory when the organiser chose it. With the directory on, one box
 * searches names and card answers (keywords); otherwise only a badge tag can be searched, by design,
 * so nobody can browse an event whose organiser chose "badge search only". Rules live in SQL.
 */
export default async function PeoplePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; tag?: string }> }) {
  const { slug } = await params
  const sp = await searchParams
  const q = (sp.q ?? sp.tag ?? '').trim().slice(0, 60)
  const session = await attendeeSession(slug)
  if (!session) return <EventClosed />
  const { ctx, me } = session
  if (!me) return <SetUpFirst slug={slug} name={ctx.name} />

  const [net, unread] = await Promise.all([networkingInfo(ctx.eventId), unreadCount(me.id)])
  const open = net.discovery !== 'off' && (net.state === 'live' || net.state === 'follow_up')
  const directoryMode = net.discovery === 'directory'
  const itsMe = q !== '' && looksLikeTag(q) && sameTag(q, me.tag)

  let found: FoundPerson[] = []
  let error: string | undefined
  if (open && q && !itsMe) {
    try {
      found = await withAttendeeDb(me.id, async (tx) => rowsOf<FoundPerson>(await tx.execute(
        directoryMode && !looksLikeTag(q) ? sql`select * from attendee_directory(${q}::text)` : sql`select * from attendee_find(${q.slice(0, 20)})`)))
    } catch (e) { error = networkingErrorCode(e) }
  }
  const everyone = open && directoryMode && !q
    ? await withAttendeeDb(me.id, async (tx) => rowsOf<FoundPerson>(await tx.execute(sql`select * from attendee_directory(''::text)`))).catch(() => [])
    : []
  const from = `/e/${slug}/people${q ? `?q=${encodeURIComponent(q)}` : ''}`

  return (
    <EventShell eyebrow={ctx.name} title="Find people">
      <AttendeeNav slug={slug} active="people" unread={unread} />
      <NetworkNotice e={error} />
      {net.discovery === 'off' && <p className="text-sm leading-6 text-[var(--muted)]">The organiser has turned off finding people for this event. Scanning someone’s badge still shows their card.</p>}
      {net.discovery !== 'off' && net.state === 'before' && <p className="text-sm leading-6 text-[var(--muted)]">Finding people opens {formatWhen(net.opensAt)}.</p>}
      {open && (
        <div className="grid gap-5">
          <form className="grid gap-2" role="search">
            <label className="field-label">{directoryMode ? 'Search by name, keyword or badge tag' : 'Tag on their badge'}
              <input className={`field-input ${directoryMode ? '' : 'font-mono uppercase'}`} type="search" name="q" defaultValue={q} placeholder={directoryMode ? 'e.g. fintech, investor, Priya or F-042' : 'F-042 or 42'} maxLength={60} autoComplete="off" />
            </label>
            {!directoryMode && <p className="text-xs text-[var(--muted)]">At this event you find people by the tag on their badge. The organiser chose not to allow browsing by name.</p>}
            <div className="flex gap-2"><button className="action-primary flex-1 justify-center">Search</button>{q && <Link href={`/e/${slug}/people`} className="action-secondary">Clear</Link>}</div>
          </form>
          {itsMe && <div role="status" className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-4 text-sm"><p className="font-extrabold">That’s you: {me.tag}</p><p className="mt-1 text-[var(--muted)]">This is the tag on your own badge.</p><Link href={`/e/${slug}/a/${me.id}`} className="mt-3 inline-block font-bold text-[var(--accent)] underline">See how your card looks to others</Link></div>}
          {q && !itsMe && !error && (
            <section className="grid gap-3">
              <h2 className="font-extrabold">Results for “{q}” ({found.length})</h2>
              <PeopleList slug={slug} from={from} people={found} questions={ctx.questions}
                empty={looksLikeTag(q) ? 'Nobody with that tag is sharing a card. They may not have set up their card yet, or chose to keep it hidden.' : 'Nobody matches that. Try another word, or search by the tag on their badge.'} />
            </section>
          )}
          {directoryMode && !q && (
            <section className="grid gap-3">
              <h2 className="font-extrabold">Everyone sharing a card ({everyone.length})</h2>
              <PeopleList slug={slug} from={from} people={everyone} empty="Nobody else is sharing a card yet." questions={ctx.questions} />
            </section>
          )}
        </div>
      )}
    </EventShell>
  )
}
