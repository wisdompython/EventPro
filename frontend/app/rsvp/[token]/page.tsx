'use client'

import { useParams } from 'next/navigation'

import PublicRsvpView from '@/components/rsvp/PublicRsvpView'

/** App-domain RSVP routes: /rsvp/:token, /r/:code and /:eventSlug/rsvp/:guest-code. */
export default function PublicRsvpPage() {
  const params = useParams<{ token?: string; code?: string; guestCode?: string }>()
  const routeValue = params.token ?? params.code ?? params.guestCode ?? ''
  const token = params.guestCode
    ? routeValue.slice(routeValue.lastIndexOf('-') + 1)
    : routeValue
  return <PublicRsvpView token={token} />
}
