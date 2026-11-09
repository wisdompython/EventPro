import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { getSiteContext } from '@/lib/sites'

/**
 * Every page under an organization's own domain renders inside this layout.
 * proxy.ts rewrites acme.com/rsvp/… to /sites/acme.com/rsvp/…; the host is
 * resolved to its organization here, server-side, before any page renders.
 */
const resolveSite = cache(async (host: string) => getSiteContext(decodeURIComponent(host)))

type Props = { params: Promise<{ host: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await resolveSite((await params).host)
  if (!site) return {}
  return {
    title: { default: site.organization.name, template: `%s · ${site.organization.name}` },
    description: undefined,
    openGraph: { title: site.organization.name, description: undefined, type: 'website' },
    twitter: { card: 'summary', title: site.organization.name, description: undefined },
  }
}

export default async function SiteLayout({ children, params }: Props & { children: React.ReactNode }) {
  const site = await resolveSite((await params).host)
  if (!site) notFound()
  return children
}
