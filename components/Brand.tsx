import { Scan } from '@phosphor-icons/react/dist/ssr'

export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-extrabold tracking-[-0.055em] ${inverse ? 'text-white' : 'text-[var(--ink)]'}`}>
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25)]">
        <Scan size={22} weight="bold" />
      </span>
      {!compact && <span className="text-[22px]">scanme</span>}
    </span>
  )
}
