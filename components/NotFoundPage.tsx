import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5 text-[var(--foreground)]">
      <div className="soft-card max-w-md p-8 text-center sm:p-12">
        <p className="eyebrow">Wrong turn</p>
        <h1 className="mt-4 text-6xl font-black tracking-[-0.06em]">404</h1>
        <p className="mt-4 text-[var(--muted)]">This ScanMe page is not here, but the right conversation still can be.</p>
        <Link
          href="/"
          className="action-primary mt-7 inline-flex"
        >
          Back home
        </Link>
      </div>
    </main>
  )
}
