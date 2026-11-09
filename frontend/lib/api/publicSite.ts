import { publicRsvpBody } from './rsvp'
import type { PublicRsvpAnswerArgs, PublicRsvpSubmitResult } from './rsvp'
import type { PublicRsvpDetails } from './types'

/**
 * Calls made from an organization's own domain (acme.com). They go to the
 * same origin, /api/sites/…, which proxy.ts forwards to the API with the
 * visitor's host attached; the API resolves the organization from it.
 * No cookies are involved, so there is no session or CSRF to manage.
 * Paths omit the trailing slash: Next.js would 308 it away before the proxy
 * runs, so the proxy adds it back for the API.
 */
async function siteRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/sites${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    credentials: 'omit',
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(
      error.detail
        ?? (res.status === 404 ? 'This invitation could not be found.' : `Request failed: ${res.status}`),
    )
  }
  return res.json()
}

export const publicSiteApi = {
  getSiteRsvp: (eventSlug: string, token: string) =>
    siteRequest<PublicRsvpDetails>(`/rsvp/${encodeURIComponent(eventSlug)}/${encodeURIComponent(token)}`),

  submitSiteRsvp: (eventSlug: string, token: string, ...answer: PublicRsvpAnswerArgs) =>
    siteRequest<PublicRsvpSubmitResult>(`/rsvp/${encodeURIComponent(eventSlug)}/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify(publicRsvpBody(...answer)),
    }),
}
