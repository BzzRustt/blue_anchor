/**
 * Event packages. PRICES ARE PLACEHOLDERS (hypotheses from the spec) until the owner confirms them;
 * change them here only. Capacity is what the purchase unlocks; the database enforces it at join.
 */
export interface EventPackage { key: string; name: string; capacity: number; pricePence: number }

export const EVENT_PACKAGES: readonly EventPackage[] = [
  { key: 'p50', name: 'Up to 50 attendees', capacity: 50, pricePence: 2900 },
  { key: 'p200', name: 'Up to 200 attendees', capacity: 200, pricePence: 9900 },
  { key: 'p500', name: 'Up to 500 attendees', capacity: 500, pricePence: 24900 },
]

export const findPackage = (key: string) => EVENT_PACKAGES.find((p) => p.key === key)
export const formatPence = (pence: number) => `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`
