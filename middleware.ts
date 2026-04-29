import { NextRequest, NextResponse } from 'next/server'
import { RateLimiter } from '@/lib/rate-limiter'

// ─── Config ───────────────────────────────────────────────────────────────────

const PROBE_ROUTES = new Set([
  '/admin',
  '/dashboard',
  '/login',
  '/cms',
  '/wp-admin',
  '/administrator',
])

// Module-level instance — lives in the Edge worker process alongside the middleware
const apiRateLimiter = new RateLimiter(60, 60_000) // 60 req / IP / minute

const MAX_BODY_BYTES = 10_240 // 10 kb

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    '0.0.0.0'
  )
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return response
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Reject POST bodies that exceed the size limit before they reach route handlers.
  // Based on Content-Length header — chunked-encoded requests without it pass through
  // and rely on route-level limits.
  // /api/upload handles its own size validation (up to 5 MB) — exclude it here
  if (request.method === 'POST' && pathname !== '/api/upload') {
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 })
    }
  }

  // Probe route decoy: rewrite internally so the browser sees the original URL and HTTP 404.
  // Not a redirect — no Location header is emitted.
  if (PROBE_ROUTES.has(pathname)) {
    return withSecurityHeaders(NextResponse.rewrite(new URL('/_404', request.url)))
  }

  // API routes: apply general rate limit before passing through.
  // Authenticated admin requests are exempt — they should never hit a wall
  // during development or admin operations.
  if (pathname.startsWith('/api/')) {
    const hasAdminSession = !!request.cookies.get('admin_session')?.value
    if (!hasAdminSession) {
      const ip = getIP(request)
      if (apiRateLimiter.isLimited(ip)) {
        return new NextResponse(null, { status: 429 })
      }
      apiRateLimiter.increment(ip)
    }
    return withSecurityHeaders(NextResponse.next())
  }

  return withSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
