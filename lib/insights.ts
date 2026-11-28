import { sql } from 'drizzle-orm'
import { withOwnerDb } from '@/lib/db'
import { personalCodeIds } from '@/lib/product'
import { type Day, type InsightsRange } from '@/lib/insights-math'

export { asRange, busiestDay, percentChange, rate, type InsightsRange } from '@/lib/insights-math'

export type ModeRow = { mode: string; visits: number; responses: number }
export type Insights = {
  range: InsightsRange
  visits: number
  previousVisits: number
  responses: number
  clicks: number
  days: Day[]
  modes: ModeRow[]
}

const LONDON_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })

type Row = {
  visits: number; previous_visits: number; responses: number; clicks: number
  per_day: Record<string, { v: number; r: number }>
  per_mode: Array<{ mode: string; visits: number; responses: number }>
}

/** Visits, responses and clicks for the last 7 or 30 days, against the period before, in one statement. RLS keeps it to this owner. */
export async function getInsights(userId: string, range: InsightsRange): Promise<Insights> {
  const pcs = personalCodeIds(userId)
  const interval = `${range} days`
  const doubled = `${range * 2} days`
  const row = await withOwnerDb(userId, async (db) => (await db.execute<Row>(sql`
    select
      (select count(*)::int from scans s where s.code_id in ${pcs} and s.scanned_at >= now() - ${interval}::interval) as visits,
      (select count(*)::int from scans s where s.code_id in ${pcs} and s.scanned_at >= now() - ${doubled}::interval and s.scanned_at < now() - ${interval}::interval) as previous_visits,
      (select count(*)::int from responses r where r.user_id = ${userId} and r.submitted_at >= now() - ${interval}::interval) as responses,
      (select count(*)::int from link_clicks l where l.code_id in ${pcs} and l.clicked_at >= now() - ${interval}::interval) as clicks,
      (select coalesce(json_object_agg(d.day, json_build_object('v', d.v, 'r', d.r)), '{}'::json) from (
         select day, sum(v)::int as v, sum(r)::int as r from (
           select to_char(s.scanned_at at time zone 'Europe/London', 'YYYY-MM-DD') as day, 1 as v, 0 as r from scans s where s.code_id in ${pcs} and s.scanned_at >= now() - interval '31 days'
           union all
           select to_char(r.submitted_at at time zone 'Europe/London', 'YYYY-MM-DD'), 0, 1 from responses r where r.user_id = ${userId} and r.submitted_at >= now() - interval '31 days') u
         group by day) d) as per_day,
      (select coalesce(json_agg(json_build_object('mode', m.mode, 'visits', m.visits, 'responses', m.responses) order by m.visits desc), '[]'::json) from (
         select ca.mode::text as mode,
           (select count(*)::int from scans s where s.campaign_id = ca.id and s.scanned_at >= now() - ${interval}::interval) as visits,
           (select count(*)::int from responses r where r.campaign_id = ca.id and r.submitted_at >= now() - ${interval}::interval) as responses
         from campaigns ca where ca.code_id in ${pcs}) m where m.visits > 0 or m.responses > 0) as per_mode`)).rows[0])
  if (!row) throw new Error('Owner row not visible')

  const days = Array.from({ length: range }, (_, index) => {
    const date = new Date(Date.now() - (range - 1 - index) * 86_400_000)
    const key = LONDON_DAY.format(date)
    return { key, label: date.toLocaleDateString('en-GB', range === 7 ? { weekday: 'short', timeZone: 'Europe/London' } : { day: 'numeric', month: 'short', timeZone: 'Europe/London' }), visits: row.per_day[key]?.v ?? 0, responses: row.per_day[key]?.r ?? 0 }
  })
  return { range, visits: row.visits, previousVisits: row.previous_visits, responses: row.responses, clicks: row.clicks, days, modes: row.per_mode }
}
