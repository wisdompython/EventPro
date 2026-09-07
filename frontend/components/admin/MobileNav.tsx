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
  open: boolean
  onClose: () => void
  pendingHref: string | null
  onNavigate: (href: string, label: string) => void
}

export function MobileNav({ user, logout, open, onClose, pendingHref, onNavigate }: Props) {
  const pathname = usePathname()
  const { can } = useAuth()
  const initial = (user.first_name?.[0] || user.username[0]).toUpperCase()
  const displayName = user.first_name ? `${user.first_name} ${user.last_name}`.trim() : user.username
  if (!open) return null

  return (
    <>
      <button className="admin-mobile-backdrop" onClick={onClose} aria-label="Close navigation" />
      <aside className="admin-mobile-nav">
        <div className="admin-mobile-nav__head">
          <Link href="/admin/today" onClick={() => { onNavigate('/admin/today', 'Today'); onClose() }}><span>EP</span><b>Event Pro</b></Link>
          <button onClick={onClose} aria-label="Close navigation">×</button>
        </div>
        <div className="admin-workspace-card"><p>Current workspace</p><OrganizationSwitcher compact tone="dark" /></div>
        <nav className="admin-sidebar__nav">
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
                  return <Link key={item.href} href={item.href} onClick={() => { onNavigate(item.href, item.label); onClose() }} className={`${active ? 'is-active' : ''}${pending ? ' is-pending' : ''}`} aria-busy={pending || undefined}><NavIcon name={item.icon}/><span>{item.label}</span>{pending ? <i className="admin-nav-spinner" aria-hidden="true" /> : active && <i className="admin-nav-current" />}</Link>
                })}
              </div>
            )
          })}
        </nav>
        <div className="admin-user-card">
          <Link href="/admin/profile" onClick={() => { onNavigate('/admin/profile', 'My account'); onClose() }}><span>{initial}</span><div><b>{displayName}</b><small>{user.membership_role_display ?? user.role_display}</small></div></Link>
          <button onClick={() => { logout(); onClose() }} aria-label="Sign out">↗</button>
        </div>
      </aside>
    </>
  )
}
