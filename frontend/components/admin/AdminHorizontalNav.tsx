'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AuthUser } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ADMIN_NAV, NavIcon } from './AdminNavigation'

export function AdminHorizontalNav({ user }: { user: AuthUser }) {
  const pathname = usePathname()
  const { can } = useAuth()

  return (
    <nav className="admin-route-strip" aria-label="Admin sections">
      <div className="admin-route-strip__inner">
        {ADMIN_NAV.map((section) => {
          const visible = section.items.filter((item) =>
            (!item.minRole || can(item.minRole)) && (!item.platformOnly || user.is_platform_admin)
          )
          if (!visible.length) return null
          return (
            <div className="admin-route-group" key={section.label}>
              <span>{section.label}</span>
              {visible.map((item) => {
                const active = pathname === item.href || (item.href !== '/admin/today' && pathname.startsWith(`${item.href}/`))
                return <Link key={item.href} href={item.href} className={active ? 'is-active' : ''} data-tour={item.tourId}><NavIcon name={item.icon} size={15}/>{item.label}</Link>
              })}
            </div>
          )
        })}
      </div>
    </nav>
  )
}
