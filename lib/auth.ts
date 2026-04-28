import type { NextRequest } from 'next/server'

/**
 * For use in middleware and API Route Handlers that have a NextRequest.
 * Returns true if the admin_session cookie is present and non-empty.
 */
export function isAdminAuthenticated(request: NextRequest): boolean {
  return !!request.cookies.get('admin_session')?.value
}

/**
 * Returns the admin route path segment from the environment.
 * Server-side only — this value must never be serialised into a client bundle
 * or included in any API response.
 */
export function getAdminPath(): string {
  return process.env.ADMIN_ROUTE_NAME ?? ''
}
