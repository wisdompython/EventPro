import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { bareHostname, isAppHost } from '@/lib/siteHost'

/**
 * Organization domains.
 *
 * The admin app lives on APP_HOSTNAMES. Any other host is an organization's
 * public site (acme.com, acme.events.example.com): its pages render from
 * app/sites/[host]/…, and its same-origin /api/sites/* calls are forwarded to
 * the API with the visitor's host attached. The API resolves that host to an
 * organization (only verified, active domains resolve) and scopes every query
 * to it, so nothing here decides which tenant a request belongs to.
 */

// Public routes an organization domain serves. Later phases add the home
// page, event catalogue and check-in here (and in public_sites.views).
const SITE_ROUTE_PREFIXES = ['/rsvp']

// Admin sign-in stays on the app domain, so cookies never cross domains.
const APP_ONLY_PREFIXES = ['/admin', '/login', '/signup', '/forgot-password', '/reset-password']

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
const INTERNAL_API_URL = (
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'
).replace(/\/$/, '')
const API_HOST = new URL(INTERNAL_API_URL).host
const PROXY_SECRET = process.env.PUBLIC_SITE_PROXY_SECRET ?? ''

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hostHeader = request.headers.get('host')

  if (isAppHost(hostHeader)) {
    // Site pages exist only behind an organization's own host.
    if (startsWithAny(pathname, ['/sites'])) {
      return NextResponse.rewrite(new URL('/404', request.url))
    }
    return NextResponse.next()
  }

  const host = bareHostname(hostHeader)

  if (pathname.startsWith('/api/sites/')) {
    const headers = new Headers(request.headers)
    // Always overwrite: a visitor must not choose the tenant by sending these.
    headers.set('x-event-pro-site-host', host)
    // The API validates Host against its own allow-list; address it as itself.
    headers.set('host', API_HOST)
    if (PROXY_SECRET) headers.set('x-event-pro-proxy-secret', PROXY_SECRET)
    else headers.delete('x-event-pro-proxy-secret')
    return NextResponse.rewrite(
      // Next.js strips trailing slashes before this runs; the API expects them.
      new URL(`${INTERNAL_API_URL}${pathname.slice('/api'.length).replace(/\/?$/, '/')}${search}`),
      { request: { headers } },
    )
  }

  if (pathname.startsWith('/media/')) {
    // Production nginx serves /media itself; this covers local development.
    const headers = new Headers(request.headers)
    headers.set('host', API_HOST)
    return NextResponse.rewrite(
      new URL(`${new URL(INTERNAL_API_URL).origin}${pathname}`),
      { request: { headers } },
    )
  }

  if (startsWithAny(pathname, APP_ONLY_PREFIXES)) {
    // Next.js relativizes redirects to localhost, so in local development this
    // stays on the organization host; a real app domain redirects correctly.
    return NextResponse.redirect(new URL(`${pathname}${search}`, APP_URL))
  }

  if (startsWithAny(pathname, SITE_ROUTE_PREFIXES)) {
    return NextResponse.rewrite(new URL(`/sites/${host}${pathname}${search}`, request.url))
  }

  // Public files from /public (icons, fonts) are shared by every host.
  if (/\.[a-z0-9]+$/i.test(pathname)) {
    return NextResponse.next()
  }

  return NextResponse.rewrite(new URL('/404', request.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
