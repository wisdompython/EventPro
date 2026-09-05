'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth'

export function OrganizationSwitcher({ compact = false, tone = 'light' }: { compact?: boolean; tone?: 'light' | 'dark' }) {
  const { user, switchOrganization } = useAuth()
  if (!user?.active_organization) return null

  if (user.organizations.length <= 1) {
    return (
      <Link
        href="/admin/company-profile"
        className="block truncate text-xs transition hover:text-[var(--brand)]"
        style={{ color: tone === 'dark' ? 'rgba(255,255,255,0.56)' : 'var(--muted)' }}
      >
        {user.active_organization.name}
      </Link>
    )
  }

  return (
    <label className="block">
      <span className="sr-only">Active workspace</span>
      <select
        aria-label="Active workspace"
        value={user.active_organization.id}
        onChange={(event) => switchOrganization(Number(event.target.value))}
        className={`w-full truncate rounded-lg border bg-transparent text-xs font-medium outline-none focus:ring-2 focus:ring-[var(--brand)] ${compact ? 'px-2 py-1.5' : 'px-2.5 py-2'}`}
        style={{
          borderColor: tone === 'dark' ? 'rgba(255,255,255,0.12)' : 'var(--line)',
          color: tone === 'dark' ? 'rgba(255,255,255,0.78)' : 'var(--ink)',
          background: tone === 'dark' ? 'rgba(255,255,255,0.06)' : 'transparent',
        }}
      >
        {user.organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
    </label>
  )
}
