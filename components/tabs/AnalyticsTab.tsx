import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import ScanChart, { type DailyCount } from './ScanChart'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toCount(val: unknown): number {
  return typeof val === 'number' ? val : 0
}

/** Build a dense 14-day array of { date, count } filled with 0s for missing days. */
function buildDailyCounts(
  scans: { scanned_at: string }[],
  from: Date
): DailyCount[] {
  const map: Record<string, number> = {}

  for (let i = 0; i < 14; i++) {
    const d = new Date(from)
    d.setUTCDate(d.getUTCDate() + i)
    map[d.toISOString().slice(0, 10)] = 0
  }

  for (const s of scans) {
    const day = s.scanned_at.slice(0, 10)
    if (day in map) map[day]++
  }

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))
}

// ─── Stat card (pure display) ─────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
        {label}
      </p>
      <p className="mt-1.5 text-3xl font-bold text-gray-900 tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// ─── Analytics tab ────────────────────────────────────────────────────────────

export default async function AnalyticsTab() {
  // Defense-in-depth auth check — the parent page already verified the session,
  // but guard again in case this component is ever composed differently.
  const cookieStore = cookies()
  if (!cookieStore.get('admin_session')?.value) {
    redirect('/')
  }

  const supabase = createAdminClient()

  // ── Date boundaries (all UTC) ──────────────────────────────────────────────
  const now = new Date()
  const todayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
  const dow = now.getUTCDay() // 0 = Sun
  const daysSinceMon = dow === 0 ? 6 : dow - 1
  const weekStartUTC = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMon
  ))
  const fourteenDaysAgoUTC = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 13
  ))

  // ── Run all queries in parallel ────────────────────────────────────────────
  const [
    allScans,
    todayScans,
    weekScans,
    allResponses,
    pollResponses,
    commentResponses,
    recentScansRaw,
  ] = await Promise.all([
    supabase.from('scans').select('*', { count: 'exact', head: true }),
    supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .gte('scanned_at', todayUTC.toISOString()),
    supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .gte('scanned_at', weekStartUTC.toISOString()),
    supabase.from('responses').select('*', { count: 'exact', head: true }),
    supabase
      .from('responses')
      .select('*', { count: 'exact', head: true })
      .not('poll_answer', 'is', null),
    supabase
      .from('responses')
      .select('*', { count: 'exact', head: true })
      .not('comment', 'is', null)
      .neq('comment', ''),
    supabase
      .from('scans')
      .select('scanned_at')
      .gte('scanned_at', fourteenDaysAgoUTC.toISOString()),
  ])

  // Surface DB connectivity errors — individual count=null is handled by toCount(),
  // so a real failure shows up as an error on the primary query
  if (allScans.error) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-400">Failed to load data. Please refresh the page.</p>
      </div>
    )
  }

  const totalScans = toCount(allScans.count)
  const scansToday = toCount(todayScans.count)
  const scansThisWeek = toCount(weekScans.count)
  const totalResponses = toCount(allResponses.count)
  const totalPollResponses = toCount(pollResponses.count)
  const totalComments = toCount(commentResponses.count)
  const responseRate =
    totalScans > 0 ? Math.round((totalResponses / totalScans) * 100) : 0

  const scans = (recentScansRaw.data ?? []) as { scanned_at: string }[]
  const dailyCounts = buildDailyCounts(scans, fourteenDaysAgoUTC)

  // ── Shared page header ──────────────────────────────────────────────────────
  const header = (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <h1 className="text-xl font-semibold text-gray-900 tracking-tight">
        ScanMe — Admin
      </h1>
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Page is live
      </span>
    </div>
  )

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (totalScans === 0) {
    return (
      <div className="space-y-6">
        {header}
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">
            No scans yet. Once you wear the shirt, scans will appear here.
          </p>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {header}

      {/* Primary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today" value={scansToday} sub="scans" />
        <StatCard label="This week" value={scansThisWeek} sub="scans" />
        <StatCard label="All time" value={totalScans} sub="scans" />
        <StatCard label="Response rate" value={`${responseRate}%`} sub="of scans" />
      </div>

      {/* Line chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">
          Scans — last 14 days
        </p>
        <ScanChart data={dailyCounts} />
      </div>

      {/* Secondary stat cards */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Poll responses" value={totalPollResponses} sub="total" />
        <StatCard label="Comments left" value={totalComments} sub="total" />
      </div>
    </div>
  )
}
