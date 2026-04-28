import { notFound } from 'next/navigation'

// Internal route used by middleware to serve a rendered 404 for probe paths.
// Calling notFound() delegates to app/not-found.tsx with a proper 404 status.
export default function ProbeNotFound() {
  notFound()
}
