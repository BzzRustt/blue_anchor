export type InsightsRange = 7 | 30
export const asRange = (value: unknown): InsightsRange => (value === '30' || value === 30 ? 30 : 7)

export type Day = { key: string; label: string; visits: number; responses: number }

/** Percentage change, or null when there is nothing to compare with. */
export const percentChange = (now: number, before: number): number | null => (before > 0 ? Math.round(((now - before) / before) * 100) : null)

/** Response rate as a whole percent, or null with no visits. */
export const rate = (responses: number, visits: number): number | null => (visits > 0 ? Math.round((responses / visits) * 100) : null)

/** The busiest day of the range by visits (first one wins a tie), or null if nothing happened. */
export function busiestDay(days: Day[]): Day | null {
  const best = days.reduce<Day | null>((top, day) => (!top || day.visits > top.visits ? day : top), null)
  return best && best.visits > 0 ? best : null
}
