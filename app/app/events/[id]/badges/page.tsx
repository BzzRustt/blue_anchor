import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { PrintButton } from '@/components/workspace/PrintButton'
import { getOwnedEvent, joinUrl } from '@/lib/event-queries'
import { requireOwner } from '@/lib/owner'

/**
 * Print-ready badge sheet. "Save as PDF" in the browser's print dialog is the PDF export:
 * a PDF library would be a dependency to maintain for output the platform already makes.
 * The print rules hide the workspace chrome and lay badges out two across on A4.
 */
export default async function BadgesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireOwner()
  const { id } = await params
  const found = await getOwnedEvent(session.user.id, id)
  if (!found) notFound()

  const { event, slug, roles, attendees } = found
  const roleLabel = new Map(roles.map((role) => [role.letter, role.label]))
  const badges = await Promise.all(attendees.filter((a) => a.status !== 'withdrawn').map(async (a) => ({
    ...a,
    qr: await QRCode.toDataURL(joinUrl(slug, a.id), { width: 240, margin: 0, errorCorrectionLevel: 'M' }),
  })))

  return (
    <div className="grid gap-6">
      {/* 2 x 4 badges of 90 x 64 mm per A4 page, with dashed cut lines and little else. */}
      <style>{`
        @page { size: A4; margin: 8mm 10mm; }
        @media print {
          aside, header, .fixed, .no-print { display: none !important; }
          .min-h-dvh { display: block !important; }
          main { max-width: none !important; padding: 0 !important; }
          .badge-sheet { display: grid !important; grid-template-columns: repeat(2, 90mm) !important; grid-auto-rows: 64mm !important; gap: 4mm 6mm !important; justify-content: center; }
          .badge { height: 64mm !important; border: 1px dashed #9aa79f !important; border-radius: 0 !important; break-inside: avoid; }
        }
      `}</style>

      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={`/app/events/${event.id}?tab=badges`} className="text-sm font-bold text-[var(--accent-strong)]">← Back to {event.name}</Link>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-.055em]">Badges</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{badges.length} {badges.length === 1 ? 'badge' : 'badges'}. In the print dialog choose “Save as PDF”, and turn off headers and footers.</p>
        </div>
        {badges.length > 0 && <PrintButton />}
      </div>

      {badges.length === 0
        ? <p className="no-print soft-card p-8 text-center text-sm text-[var(--muted)]">No badges yet. Add your attendee list on the event page first.</p>
        : <div className="badge-sheet grid grid-cols-1 gap-3 sm:grid-cols-2">{badges.map((b) => (
          // Name first and biggest (it's what people read across a room), then role, then tag + QR.
          <article key={b.id} className="badge grid h-[64mm] grid-rows-[1fr_auto] gap-2 rounded-2xl border border-[var(--line)] bg-white px-[6mm] py-[5mm] text-[#102018]">
            <div className="min-w-0">
              {b.source === 'walk_up'
                ? <p className="mt-6 border-b-2 border-[#102018] pb-1 text-[11px] font-bold uppercase tracking-[.1em] text-[#5b6b62]">Write your name</p>
                : <p className="line-clamp-2 break-words text-[26px] font-extrabold leading-[1.1] tracking-[-.02em]">{b.displayName}</p>}
              {b.roleLetter && <p className="mt-1.5 text-[13px] font-extrabold uppercase tracking-[.12em] text-[#2f5a46]">{roleLabel.get(b.roleLetter) ?? b.roleLetter}</p>}
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[30px] font-extrabold leading-none tracking-tight">{b.tag}</p>
                <p className="mt-1.5 truncate text-[9px] font-bold uppercase tracking-[.1em] text-[#5b6b62]">{event.name} · code {event.accessCode}</p>
              </div>
              <div className="flex w-[22mm] shrink-0 flex-col items-center gap-0.5">
                <Image src={b.qr} alt="" width={240} height={240} unoptimized className="h-auto w-full" />
                <p className="text-center text-[7px] font-bold uppercase leading-tight tracking-[.06em] text-[#5b6b62]">{b.source === 'walk_up' ? 'Scan to set up' : 'Scan to see my card'}</p>
              </div>
            </div>
          </article>
        ))}</div>}
    </div>
  )
}
