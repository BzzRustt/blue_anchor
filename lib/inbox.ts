import { sql } from 'drizzle-orm'
import { withOwnerDb } from '@/lib/db'
import { historyWindowSql } from '@/lib/product'

export const INBOX_FILTERS = ['all', 'unread', 'archived', 'blocked'] as const
export type InboxFilter = (typeof INBOX_FILTERS)[number]
export const asInboxFilter = (value: unknown): InboxFilter => (INBOX_FILTERS.includes(value as InboxFilter) ? (value as InboxFilter) : 'all')

export type InboxItem = {
  id: string
  /** [question, answer] pairs in question order; answers to deleted questions come last, unlabelled. */
  answers: Array<[string, string]>
  readAt: string | null
  archived: boolean
  flagged: boolean
  blocked: boolean
  submittedAt: string
  campaignName: string | null
  mode: string | null
  /** A short, stable label for the visitor's browser, e.g. "3F2". Not reversible to anything personal. */
  visitor: string
  /** How many responses this visitor has sent (in the history window), and which one this is. */
  fromSame: number
  nth: number
}

type Row = {
  id: string; answers: Record<string, unknown>; read_at: Date | null; archived: boolean; flagged: boolean; blocked: boolean
  submitted_at: Date; campaign_name: string | null; mode: string | null; visitor: string; from_same: number; nth: number
  prompts: Record<string, { prompt: string; position: number }> | null
}

const text = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(text).join(', ')
  return ''
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The inbox list, one statement. `source` (a Mode's campaign id) is ignored unless it is a uuid; RLS keeps it to this owner. */
export async function inboxItems(userId: string, filter: InboxFilter, source: string): Promise<InboxItem[]> {
  const where = {
    all: sql`not m.archived`,
    unread: sql`not m.archived and m.read_at is null`,
    archived: sql`m.archived and not m.blocked`,
    blocked: sql`m.blocked`,
  }[filter]
  const bySource = UUID.test(source) ? sql`and m.campaign_id = ${source}::uuid` : sql``
  const rows = await withOwnerDb(userId, async (db) => (await db.execute<Row>(sql`
    with w as (select ${historyWindowSql(userId)} as since),
    mine as (
      select r.*, count(*) over (partition by r.session_token) as from_same,
             row_number() over (partition by r.session_token order by r.submitted_at) as nth
      from responses r, w where r.user_id = ${userId} and (w.since is null or r.submitted_at >= w.since))
    select m.id, m.answers, m.read_at, m.archived, m.flagged, m.blocked, m.submitted_at,
           m.from_same::int as from_same, m.nth::int as nth, upper(substr(md5(m.session_token), 1, 3)) as visitor,
           ca.name as campaign_name, ca.mode::text as mode,
           (select json_object_agg(qb.id, json_build_object('prompt', qb.config->>'prompt', 'position', qb.position))
              from question_blocks qb where qb.campaign_id = m.campaign_id) as prompts
    from mine m left join campaigns ca on ca.id = m.campaign_id
    where ${where} ${bySource}
    order by m.submitted_at desc limit 50`)).rows)

  return rows.map((row) => {
    const prompts = row.prompts ?? {}
    const answers = Object.entries(row.answers ?? {})
      .map(([key, value]) => ({ label: prompts[key]?.prompt ?? '', order: prompts[key]?.position ?? 99, value: text(value) }))
      .filter((a) => a.value)
      .sort((a, b) => a.order - b.order)
      .map((a) => [a.label, a.value] as [string, string])
    return {
      id: row.id, answers, readAt: row.read_at ? new Date(row.read_at).toISOString() : null, archived: row.archived, flagged: row.flagged, blocked: row.blocked,
      submittedAt: new Date(row.submitted_at).toISOString(), campaignName: row.campaign_name, mode: row.mode, visitor: row.visitor, fromSame: row.from_same, nth: row.nth,
    }
  })
}
