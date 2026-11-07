interface Entry {
  count: number
  resetAt: number
}

export class RateLimiter {
  private readonly map = new Map<string, Entry>()
  private readonly max: number
  private readonly windowMs: number

  // Assigned in the body rather than as constructor parameter properties: those need a
  // TypeScript codegen step, and Node's strip-only mode rejects them, which would make
  // this file — and every file importing it — impossible to run under `node --test`.
  constructor(max: number, windowMs: number) {
    this.max = max
    this.windowMs = windowMs
  }

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
