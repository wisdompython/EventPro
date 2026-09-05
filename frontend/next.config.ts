import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Docker on WSL2 serves this project over a 9p bind mount, where inotify
  // events never arrive. Turbopack has no polling fallback, so it silently
  // stops discovering routes and every newly added page 404s. Webpack does
  // support polling, so the Docker dev script opts out of Turbopack and this
  // block turns polling on. A native run keeps Turbopack and native watching.
  webpack: (config) => {
    if (process.env.WATCHPACK_POLLING === 'true') {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ['**/node_modules/**', '**/.next/**', '**/.git/**'],
      }
    }
    return config
  },
  async redirects() {
    return [
      { source: '/admin/guests/bulk-upload', destination: '/admin/list-import', permanent: false },
      { source: '/admin/settings/templates', destination: '/admin/message-library', permanent: false },
      { source: '/admin/developer/queue', destination: '/admin/delivery-monitor', permanent: false },
      { source: '/admin/dashboard', destination: '/admin/today', permanent: false },
      { source: '/admin/productions/:path*', destination: '/admin/event-management/:path*', permanent: false },
      { source: '/admin/events/:path*', destination: '/admin/event-management/:path*', permanent: false },
      { source: '/admin/guests/:path*', destination: '/admin/guestbook/:path*', permanent: false },
      { source: '/admin/check-in', destination: '/admin/door-desk', permanent: false },
      { source: '/admin/invitations/:path*', destination: '/admin/rsvp-management/:path*', permanent: false },
      { source: '/admin/rsvp/:path*', destination: '/admin/rsvp-management/:path*', permanent: false },
      { source: '/admin/whatsapp', destination: '/admin/guest-messages', permanent: false },
      { source: '/admin/reminders', destination: '/admin/follow-ups', permanent: false },
      { source: '/admin/fonts', destination: '/admin/pass-studio', permanent: false },
      { source: '/admin/organization', destination: '/admin/company-profile', permanent: false },
      { source: '/admin/users', destination: '/admin/crew-access', permanent: false },
      { source: '/admin/docs', destination: '/admin/playbook', permanent: false },
    ]
  },
}

export default nextConfig
