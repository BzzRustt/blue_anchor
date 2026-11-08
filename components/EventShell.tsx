import { Scan } from '@phosphor-icons/react/dist/ssr'
import type { ReactNode } from 'react'

/** The public attendee frame. Mirrors the visitor page at /t/[code] so both feel like one product. */
export function EventShell({ eyebrow, title, subtitle, children }: { eyebrow?: string; title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <main className="min-h-dvh bg-[var(--accent-soft)] px-4 py-6 sm:grid sm:place-items-center sm:py-10">
      <article className="mx-auto w-full max-w-[520px] overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface-strong)] shadow-[var(--shadow)]">
        <div className="h-2 bg-[var(--accent)]" />
        <div className="p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <span className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--accent-strong)]">{eyebrow ?? 'Event'}</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold"><Scan size={16} className="text-[var(--accent)]" />scanme</span>
          </div>
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
    <EventShell title="This directory isn’t open" subtitle="The event may have ended, or the link may be wrong. Ask the organiser for the current link." />
  )
}
