export default function WorkspaceLoading() {
  return (
    <div className="grid animate-pulse gap-7">
      <div className="grid gap-3">
        <div className="h-3 w-24 rounded-full bg-[var(--surface-strong)]" />
        <div className="h-10 w-72 max-w-full rounded-2xl bg-[var(--surface-strong)]" />
        <div className="h-5 w-full max-w-xl rounded-full bg-[var(--surface-strong)]" />
      </div>
      <section className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-36 rounded-[var(--radius)] bg-[var(--surface-strong)]" />)}
      </section>
      <div className="h-80 rounded-[var(--radius)] bg-[var(--surface-strong)]" />
    </div>
  )
}
