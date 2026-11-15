/** The attendee's tag, large and dark, like the badge itself. No hooks, so server and client can both use it. */
export function BadgePlate({ tag, name, label = 'Your attendee tag', note }: { tag: string; name?: string; label?: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-[#1a382a] p-5 text-center text-white">
      <p className="text-xs font-bold uppercase tracking-[.12em] text-[#c6d5cc]">{label}</p>
      <strong className="mt-2 block font-mono text-5xl font-extrabold tracking-[.05em]">{tag}</strong>
      {name && <p className="mt-2 text-sm font-semibold text-[#e1eddd]">{name}</p>}
      {note && <p className="mt-3 text-sm leading-6 text-[#c6d5cc]">{note}</p>}
    </div>
  )
}
