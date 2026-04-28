interface Entry {
  count: number
  resetAt: number
}

export class RateLimiter {
  private readonly map = new Map<string, Entry>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  isLimited(key: string): boolean {
    const now = Date.now()
    const entry = this.map.get(key)
    if (!entry || now > entry.resetAt) return false
    return entry.count >= this.max
  }

  increment(key: string): void {
    const now = Date.now()
    const entry = this.map.get(key)
    if (!entry || now > entry.resetAt) {
      this.map.set(key, { count: 1, resetAt: now + this.windowMs })
    } else {
      entry.count++
    }
  }

  clear(key: string): void {
    this.map.delete(key)
  }
}

export const authLimiter = new RateLimiter(3, 3_600_000)       // 3 failures / IP / hour
export const submissionLimiter = new RateLimiter(5, 3_600_000) // 5 / IP hash / hour
export const generalLimiter = new RateLimiter(60, 60_000)      // 60 / IP / minute
