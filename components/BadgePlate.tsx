/**
 * The attendee's badge on screen, laid out like the printed one: name first and biggest, then the
 * tag. No hooks, so server and client can both use it.
 */
export function BadgePlate({ tag, name, label = 'Your attendee tag', note }: { tag: string; name?: string; label?: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-[#1a382a] p-5 text-center text-white">
      {name
        ? <strong className="block break-words text-3xl font-extrabold leading-tight tracking-[-.02em]">{name}</strong>
        : <p className="text-xs font-bold uppercase tracking-[.12em] text-[#c6d5cc]">{label}</p>}
      <p className="mt-2 font-mono text-2xl font-extrabold tracking-[.05em] text-[#e1eddd]"><span className="sr-only">{label}: </span>{tag}</p>
      {note && <p className="mt-3 text-sm leading-6 text-[#c6d5cc]">{note}</p>}
    </div>
  )
}
