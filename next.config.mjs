/** @type {import('next').NextConfig} */
const nextConfig = {
  // Profile photos are uploaded through a server action (re-encoded and capped at 5 MB there).
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  // Nickname links: scanme.app/@name opens that person's page (never while their Mode is Incognito).
  async rewrites() {
    return [{ source: '/@:handle', destination: '/u/:handle' }]
  },
  // The workspace moved to five tabs (Home, Modes, Events, Shop, Profile). Old routes redirect so
  // bookmarks and links keep working; Next carries the query string (e.g. ?filter=unread) across.
  async redirects() {
    return [
      { source: '/app/inbox', destination: '/app', permanent: false },
      { source: '/app/insights', destination: '/app?view=analytics', permanent: false },
      { source: '/app/code', destination: '/app', permanent: false },
      { source: '/app/campaigns', destination: '/app/modes', permanent: false },
      { source: '/app/campaigns/:path*', destination: '/app/modes', permanent: false },
      { source: '/app/modes/new', destination: '/app/modes', permanent: false },
    ]
  },
}

export default nextConfig
