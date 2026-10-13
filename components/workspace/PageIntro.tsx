import type { ReactNode } from 'react'

export function PageIntro({ eyebrow, title, body, action }: { eyebrow?: string; title: string; body: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-extrabold uppercase tracking-[.14em] text-[var(--accent-strong)]">{eyebrow}</p>}
        <h1 className="text-3xl font-extrabold tracking-[-.055em] sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">{body}</p>
      </div>
      {action}
    </header>
  )
}
