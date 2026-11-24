import { Scan } from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { BusyForms } from '@/components/BusyForms'
import { ThemeToggle } from '@/components/ThemeToggle'

/** The public attendee frame. Mirrors the visitor page at /t/[code] so both feel like one product. */
export function EventShell({ eyebrow, title, subtitle, children }: { eyebrow?: string; title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <main className="min-h-dvh bg-[var(--accent-soft)] px-4 py-6 sm:grid sm:place-items-center sm:py-10">
      <article className="mx-auto w-full max-w-[520px] overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface-strong)] shadow-[var(--shadow)]">
        <div className="h-2 bg-[var(--accent)]" />
        <div className="p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <span className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--accent-strong)]">{eyebrow ?? 'Event'}</span>
            <div className="flex items-center gap-2">
              <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-extrabold hover:underline"><Scan size={16} className="text-[var(--accent)]" />scanme</Link>
              <ThemeToggle />
            </div>
          </div>
          <BusyForms />
          <h1 className="mt-6 text-3xl font-extrabold tracking-[-.055em]">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </article>
    </main>
  )
}

/**
 * One page for a closed, expired and nonexistent event, with identical wording, so the page
 * cannot be used to find out which event slugs exist.
 */
export function EventClosed() {
  return (
    <EventShell title="This event isn’t open" subtitle="The event may have ended, or the link may be wrong. Ask the organiser for the current link.">
      {/* Same for every slug, so it reveals nothing. The conversion path after an event closes. */}
      <div className="grid gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="font-extrabold">Met good people there?</p>
        <p className="text-sm leading-6 text-[var(--muted)]">If you added this event to your ScanMe account, your conversations are kept there (read-only), under Events, Attending. You can also get your own permanent ScanMe code for free.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href="/login?next=/app/events" className="action-primary w-full justify-center">Sign in to see them</Link>
          <Link href="/signup" className="action-secondary w-full justify-center">Create a free account</Link>
        </div>
      </div>
    </EventShell>
  )
}
