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
  const badges = await Promise.all(attendees.map(async (a) => ({
    ...a,
    qr: await QRCode.toDataURL(joinUrl(slug, a.id), { width: 240, margin: 0, errorCorrectionLevel: 'M' }),
  })))

  return (
    <div className="grid gap-6">
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          aside, header, .fixed, .no-print { display: none !important; }
          .min-h-dvh { display: block !important; }
          main { max-width: none !important; padding: 0 !important; }
          .badge { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={`/app/events/${event.id}`} className="text-sm font-bold text-[var(--accent-strong)]">← Back to {event.name}</Link>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-.055em]">Badges</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{badges.length} {badges.length === 1 ? 'badge' : 'badges'}. In the print dialog choose “Save as PDF”, and turn off headers and footers.</p>
        </div>
        {badges.length > 0 && <PrintButton />}
      </div>

      {badges.length === 0
        ? <p className="no-print soft-card p-8 text-center text-sm text-[var(--muted)]">No badges yet. Add your attendee list on the event page first.</p>
        : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{badges.map((b) => (
          <article key={b.id} className="badge flex h-[70mm] items-stretch gap-4 rounded-2xl border border-[var(--line)] bg-white p-5 text-[#102018]">
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <div>
                <p className="font-mono text-5xl font-extrabold leading-none tracking-tight">{b.tag}</p>
                {b.roleLetter && <p className="mt-2 text-sm font-extrabold uppercase tracking-[.12em]">{roleLabel.get(b.roleLetter) ?? b.roleLetter}</p>}
              </div>
              <div className="min-w-0">
                {b.source === 'walk_up'
                  ? <p className="border-b-2 border-[#102018] pb-5 text-xs font-bold uppercase tracking-[.1em] text-[#5b6b62]">Write your name</p>
                  : <p className="break-words text-xl font-extrabold leading-tight">{b.displayName}</p>}
                <p className="mt-2 text-[10px] font-bold uppercase tracking-[.1em] text-[#5b6b62]">{event.name} · code {event.accessCode}</p>
              </div>
            </div>
            <div className="flex w-[26mm] shrink-0 flex-col items-center justify-end gap-1">
              <Image src={b.qr} alt="" width={240} height={240} unoptimized className="h-auto w-full" />
              <p className="text-center text-[8px] font-bold uppercase leading-tight tracking-[.08em] text-[#5b6b62]">Scan to add your profile</p>
            </div>
          </article>
        ))}</div>}
    </div>
  )
}
