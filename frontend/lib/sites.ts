export interface SiteContext {
  hostname: string
  organization: { name: string; slug: string }
  /** Public route families this domain serves, e.g. ['rsvp']. */
  routes: string[]
}

const INTERNAL_API_URL = (
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'
).replace(/\/$/, '')

/**
 * Resolve an organization domain server-side. Returns null for any host that
 * is not an active domain of an active organization.
 */
export async function getSiteContext(host: string): Promise<SiteContext | null> {
  const headers: Record<string, string> = { 'x-event-pro-site-host': host }
  if (process.env.PUBLIC_SITE_PROXY_SECRET) {
    headers['x-event-pro-proxy-secret'] = process.env.PUBLIC_SITE_PROXY_SECRET
  }
  const res = await fetch(`${INTERNAL_API_URL}/sites/current/`, { headers, cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Could not resolve site ${host}: ${res.status}`)
  return res.json()
}
