import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { ChartLineUp, ChatCircleDots, QrCode, TrendUp } from '@phosphor-icons/react/dist/ssr'
import { PageIntro } from '@/components/workspace/PageIntro'
import { db, schema } from '@/lib/db'
import { requireOwner } from '@/lib/owner'
import { ownerSummary } from '@/lib/product'

function getSevenDayWindowStart() {
  const date = new Date()
  date.setDate(date.getDate() - 6)
  date.setHours(0, 0, 0, 0)
  return date
}

export default async function InsightsPage() {
  const session = await requireOwner()
  const since = getSevenDayWindowStart()
  const codes = await db.select({ id: schema.codes.id }).from(schema.codes).where(eq(schema.codes.userId, session.user.id))
  const codeIds = codes.map((code) => code.id)
  const [summary, scans] = await Promise.all([
    ownerSummary(session.user.id),
    codeIds.length
      ? db
          .select({ codeId: schema.scans.codeId, scannedAt: schema.scans.scannedAt })
          .from(schema.scans)
          .where(and(gte(schema.scans.scannedAt, since), inArray(schema.scans.codeId, codeIds)))
          .orderBy(desc(schema.scans.scannedAt))
      : Promise.resolve([]),
  ])
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(since.getTime() + index * 86_400_000); return { key: date.toISOString().slice(0, 10), label: date.toLocaleDateString('en-GB', { weekday: 'short' }), count: 0 } })
  for (const scan of scans) { const day = days.find((item) => item.key === scan.scannedAt.toISOString().slice(0, 10)); if (day) day.count++ }
  const max = Math.max(1, ...days.map((day) => day.count))

  return <div className="grid gap-7"><PageIntro eyebrow="Performance" title="Insights" body="See whether your code is getting noticed and which moments turn into responses." /><section className="grid gap-3 sm:grid-cols-3">{[{ label: 'All scans', value: summary.scans, icon: QrCode }, { label: 'Responses', value: summary.responses, icon: ChatCircleDots }, { label: 'Conversion', value: `${summary.conversion}%`, icon: TrendUp }].map((item) => <article key={item.label} className="soft-card p-5"><item.icon size={21} className="text-[var(--accent)]" /><p className="mt-4 text-3xl font-extrabold">{item.value}</p><p className="mt-1 text-sm text-[var(--muted)]">{item.label}</p></article>)}</section><section className="soft-card p-5 sm:p-7"><div className="flex items-center justify-between"><div><h2 className="font-extrabold">Scans this week</h2><p className="mt-1 text-xs text-[var(--muted)]">Local activity across your codes</p></div><ChartLineUp size={23} className="text-[var(--accent)]" /></div><div className="mt-8 grid h-64 grid-cols-7 items-end gap-2 border-b border-[var(--line)] sm:gap-4">{days.map((day) => <div key={day.key} className="grid h-full grid-rows-[1fr_auto] items-end gap-2 text-center"><div className="flex h-full items-end"><div title={`${day.count} scans`} className="w-full rounded-t-lg bg-[var(--accent)]" style={{ height: `${Math.max(5, (day.count / max) * 100)}%` }} /></div><span className="pb-2 text-xs font-bold text-[var(--muted)]">{day.label}</span></div>)}</div></section></div>
}
