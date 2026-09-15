'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth, useRequireAuth } from '@/lib/auth'
import { MobileNav } from '@/components/admin/MobileNav'
import { NavSidebar } from '@/components/admin/NavSidebar'
import { TourProvider } from '@/components/tour/TourProvider'
import './admin-shell.css'
import './admin-system.css'

const PAGE_TITLES: Record<string, string> = {
  today: 'Today', 'event-management': 'Event management', guestbook: 'Guestbook', 'door-desk': 'Door desk',
  'guest-messages': 'Guest messages', 'follow-ups': 'Follow-ups', 'rsvp-management': 'RSVP management', 'pass-studio': 'Pass studio', 'seating-plan': 'Event planner',
  'crew-access': 'Crew access', 'company-profile': 'Company profile', settings: 'Messaging settings', playbook: 'Playbook', profile: 'My account',
  'message-library': 'Message library', 'delivery-monitor': 'Delivery monitor', 'list-import': 'List import',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, can } = useAuth()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarClosed, setSidebarClosed] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<{ href: string; label: string } | null>(null)
  useRequireAuth()

  useEffect(() => {
    setSidebarClosed(window.localStorage.getItem('event-pro-sidebar-closed') === 'true')
  }, [])

  useEffect(() => {
    setPendingNavigation(null)
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!pendingNavigation) return
    const timeout = window.setTimeout(() => setPendingNavigation(null), 10_000)
    return () => window.clearTimeout(timeout)
  }, [pendingNavigation])

  function beginNavigation(href: string, label: string) {
    if (href === pathname) return
    setPendingNavigation({ href, label })
  }

  function toggleSidebar() {
    setSidebarClosed((current) => {
      const next = !current
      window.localStorage.setItem('event-pro-sidebar-closed', String(next))
      return next
    })
  }

  if (loading || !user) {
    return <div className="admin-loading"><span>EP</span><i /><p>Preparing your workspace</p></div>
  }

  const section = pathname.split('/')[2] || 'today'
  const title = PAGE_TITLES[section] ?? 'Event Pro'

  return (
    <TourProvider>
      <div className={`admin-shell${sidebarClosed ? ' is-sidebar-closed' : ''}${pendingNavigation ? ' is-navigating' : ''}`}>
        <NavSidebar user={user} logout={logout} onCollapse={toggleSidebar} pendingHref={pendingNavigation?.href ?? null} onNavigate={beginNavigation} />
        <MobileNav user={user} logout={logout} open={mobileOpen} onClose={() => setMobileOpen(false)} pendingHref={pendingNavigation?.href ?? null} onNavigate={beginNavigation} />
        <div className="admin-shell__workspace">
          {pendingNavigation && (
            <div className="admin-navigation-feedback" role="status" aria-live="polite">
              <i aria-hidden="true" />
              <span>Opening {pendingNavigation.label}…</span>
            </div>
          )}
          <header className="admin-topbar">
            <div className="admin-topbar__title">
              <button onClick={() => setMobileOpen(true)} className="admin-menu-button" aria-label="Open navigation">
                <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
              </button>
              <button
                type="button"
                onClick={toggleSidebar}
                className="admin-desktop-menu-button"
                aria-label={sidebarClosed ? 'Open navigation' : 'Hide navigation'}
                aria-expanded={!sidebarClosed}
                title={sidebarClosed ? 'Open navigation' : 'Hide navigation'}
              >
                <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M8 4v16" />
                  {sidebarClosed ? <path d="m12 9 3 3-3 3" /> : <path d="m15 9-3 3 3 3" />}
                </svg>
              </button>
              <div><p>Event Pro / {user.active_organization?.name}</p><h1>{title}</h1></div>
            </div>
            <div className="admin-topbar__actions">
              <Link href="/admin/guestbook/search" className="admin-search-link" onClick={() => beginNavigation('/admin/guestbook/search', 'Guest search')}>
                <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
                <span>Find a guest</span><kbd>⌘ K</kbd>
              </Link>
              <Link href="/admin/follow-ups" className="admin-icon-button" aria-label="View follow-ups" onClick={() => beginNavigation('/admin/follow-ups', 'Follow-ups')}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 6-3 7-3 7h18s-3-1-3-7M10 20h4"/></svg><i />
              </Link>
              {can('event_manager') && <Link href="/admin/event-management/add" className="admin-create-button" onClick={() => beginNavigation('/admin/event-management/add', 'New event')}><span>＋</span> New event</Link>}
            </div>
          </header>
          <main className="admin-main">{children}</main>
        </div>
      </div>
    </TourProvider>
  )
}
