'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AuthUser } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ADMIN_NAV, NavIcon } from './AdminNavigation'
import { OrganizationSwitcher } from './OrganizationSwitcher'

interface Props {
  user: AuthUser
  logout: () => void
  onCollapse: () => void
  pendingHref: string | null
  onNavigate: (href: string, label: string) => void
}

export function NavSidebar({ user, logout, onCollapse, pendingHref, onNavigate }: Props) {
  const pathname = usePathname()
  const { can } = useAuth()
  const initial = (user.first_name?.[0] || user.username[0]).toUpperCase()
  const displayName = user.first_name ? `${user.first_name} ${user.last_name}`.trim() : user.username

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar__brand">
        <Link href="/admin/today" onClick={() => onNavigate('/admin/today', 'Today')}><span>EP</span><div><b>Event Pro</b><small>Host operations</small></div></Link>
        <button type="button" className="admin-sidebar__collapse" onClick={onCollapse} aria-label="Collapse navigation" title="Collapse navigation">
          <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M8 4v16m7-5-3-3 3-3" />
          </svg>
        </button>
      </div>

      <div className="admin-workspace-card">
        <p>Operating as</p>
        <OrganizationSwitcher compact tone="dark" />
      </div>

      <nav className="admin-sidebar__nav" aria-label="Event Pro navigation">
        {ADMIN_NAV.map((section) => {
          const visible = section.items.filter((item) =>
            (!item.minRole || can(item.minRole)) && (!item.platformOnly || user.is_platform_admin)
          )
          if (!visible.length) return null
          return (
            <div key={section.label} className="admin-nav-group">
              <p>{section.label}</p>
              {visible.map((item) => {
                const active = pathname === item.href || (item.href !== '/admin/today' && pathname.startsWith(`${item.href}/`))
                const pending = pendingHref === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-tour={item.tourId}
                    className={`${active ? 'is-active' : ''}${pending ? ' is-pending' : ''}`}
                    onClick={() => onNavigate(item.href, item.label)}
                    aria-busy={pending || undefined}
                  >
                    <NavIcon name={item.icon} />
                    <span>{item.label}</span>
                    {pending ? <i className="admin-nav-spinner" aria-hidden="true" /> : active && <i className="admin-nav-current" />}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      <div className="admin-sidebar__status"><i /><span><b>Ready for guests</b><small>Messaging and doors online</small></span></div>
      <div className="admin-user-card">
        <Link href="/admin/profile" onClick={() => onNavigate('/admin/profile', 'My account')}><span>{initial}</span><div><b>{displayName}</b><small>{user.membership_role_display ?? user.role_display}</small></div></Link>
        <button onClick={logout} aria-label="Sign out" title="Sign out">
          <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        </button>
      </div>
    </aside>
  )
}
