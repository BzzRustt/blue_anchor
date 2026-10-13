export default function Loading() {
  return (
    <main className="min-h-screen animate-pulse bg-[var(--background)] px-5 py-6 text-[var(--foreground)]">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-5">
          <div className="h-11 w-36 rounded-2xl bg-[var(--surface-strong)]" />
          <div className="hidden h-11 w-72 rounded-2xl bg-[var(--surface-strong)] sm:block" />
          <div className="h-11 w-24 rounded-2xl bg-[var(--surface-strong)]" />
        </div>
        <section className="grid min-h-[720px] items-center gap-10 py-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-5">
            <div className="h-4 w-36 rounded-full bg-[var(--surface-strong)]" />
            <div className="h-44 max-w-xl rounded-[28px] bg-[var(--surface-strong)]" />
            <div className="h-16 max-w-lg rounded-2xl bg-[var(--surface-strong)]" />
            <div className="h-14 w-64 rounded-2xl bg-[var(--surface-strong)]" />
          </div>
          <div className="aspect-[4/3] rounded-[36px] bg-[var(--surface-strong)]" />
        </section>
      </div>
    </main>
  )
}
