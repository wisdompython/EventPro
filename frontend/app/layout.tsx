import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: {
    default: 'Event Pro',
    template: '%s · Event Pro',
  },
  description: 'Manage every guest from WhatsApp invitation and RSVP to seating, branded passes, and event-day check-in.',
  openGraph: {
    title: 'Event Pro — Plan with clarity. Host with confidence.',
    description: 'One beautifully organized workspace for every guest and every event detail.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Event Pro — Plan with clarity. Host with confidence.',
    description: 'One beautifully organized workspace for every guest and every event detail.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased"><AuthProvider>{children}</AuthProvider></body>
    </html>
  )
}
