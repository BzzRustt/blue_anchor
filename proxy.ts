import { NextRequest, NextResponse } from 'next/server'
import { RateLimiter } from '@/lib/rate-limiter'

const PROBE_ROUTES = new Set(['/admin', '/dashboard', '/cms', '/wp-admin', '/administrator'])
const apiRateLimiter = new RateLimiter(60, 60_000)
const MAX_BODY_BYTES = 10_240

function getIP(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? request.headers.get('x-real-ip')
    ?? '0.0.0.0'
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return response
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (request.method === 'POST') {
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 })
    }
  }

  if (PROBE_ROUTES.has(pathname)) {
    return withSecurityHeaders(NextResponse.rewrite(new URL('/_404', request.url)))
  }

  if (pathname.startsWith('/api/')) {
    const ip = getIP(request)
    if (apiRateLimiter.isLimited(ip)) return new NextResponse(null, { status: 429 })
    apiRateLimiter.increment(ip)
  }

  return withSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
