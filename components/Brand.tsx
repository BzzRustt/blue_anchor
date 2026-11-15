import { Scan } from '@phosphor-icons/react/dist/ssr'

export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-extrabold tracking-[-0.055em] ${inverse ? 'text-white' : 'text-[var(--ink)]'}`}>
      <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-[var(--lime)] text-[var(--deep)]">
        <Scan size={22} weight="bold" />
      </span>
      {!compact && <span className="text-[22px]">scanme</span>}
    </span>
  )
}
