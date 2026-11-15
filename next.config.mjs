/** @type {import('next').NextConfig} */
const nextConfig = {
  // The workspace moved to five tabs (Home, Modes, Events, Shop, Profile). Old routes redirect so
  // bookmarks and links keep working; Next carries the query string (e.g. ?filter=unread) across.
  async redirects() {
    return [
      { source: '/app/inbox', destination: '/app', permanent: false },
      { source: '/app/insights', destination: '/app?view=analytics', permanent: false },
      { source: '/app/code', destination: '/app', permanent: false },
      { source: '/app/campaigns', destination: '/app/modes', permanent: false },
      { source: '/app/campaigns/:path*', destination: '/app/modes/:path*', permanent: false },
    ]
  },
}

export default nextConfig
