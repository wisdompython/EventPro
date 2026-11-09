import type { Metadata } from 'next'

import PublicRsvpView from '@/components/rsvp/PublicRsvpView'

type Props = { params: Promise<{ host: string; eventSlug: string; guestCode: string }> }

export const metadata: Metadata = {
  title: 'RSVP',
  // Each link is personal to one guest.
  robots: { index: false, follow: false },
}

/** acme.com/rsvp/:eventSlug/:guestCode — the guest's RSVP on their host's domain. */
export default async function SiteRsvpPage({ params }: Props) {
  const { eventSlug, guestCode } = await params
  return <PublicRsvpView eventSlug={eventSlug} token={guestCode} />
}
