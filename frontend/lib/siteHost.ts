/**
 * Which hostnames serve the admin app, and which serve an organization's
 * public site. Shared by proxy.ts (server) and the auth provider (browser).
 *
 * Every hostname not listed here is treated as an organization domain and is
 * resolved to its organization by the API; unknown hosts get a 404.
 */
export const APP_HOSTNAMES = new Set(
  (process.env.NEXT_PUBLIC_APP_HOSTNAMES ?? 'localhost,127.0.0.1')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
)

/** `Acme.com:3000` → `acme.com` */
export function bareHostname(host: string | null | undefined): string {
  return (host ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
}

export function isAppHost(host: string | null | undefined): boolean {
  const hostname = bareHostname(host)
  return !hostname || APP_HOSTNAMES.has(hostname)
}
