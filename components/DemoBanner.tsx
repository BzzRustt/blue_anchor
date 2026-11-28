/** Site-wide notice while ScanMe is in demo. Delete the <DemoBanner /> line in app/layout.tsx to remove it. */
export function DemoBanner() {
  return (
    <div role="note" className="bg-[var(--deep,#14352b)] px-4 py-2 text-center text-xs font-semibold leading-5 text-white">
      ScanMe is still in development and in demo. It is not finished or fully live yet, so some things may not work.
    </div>
  )
}
