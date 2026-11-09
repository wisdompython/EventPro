import type { UserRole } from '@/lib/api'

export type AdminIconName = 'clipboard' | 'pulse' | 'calendar' | 'guests' | 'scan' | 'rsvp' | 'message' | 'bell' | 'design' | 'team' | 'settings' | 'queue' | 'docs' | 'upload' | 'seating' | 'globe'

export interface AdminNavItem {
  href: string
  label: string
  icon: AdminIconName
  minRole?: UserRole
  platformOnly?: boolean
  tourId?: string
}

export const ADMIN_NAV: Array<{ label: string; items: AdminNavItem[] }> = [
  { label: 'Event day', items: [
    { href: '/admin/today', label: 'Today', icon: 'pulse', minRole: 'check_in_staff', tourId: 'nav-dashboard' },
    { href: '/admin/guestbook', label: 'Guestbook', icon: 'guests', minRole: 'check_in_staff', tourId: 'nav-guests' },
    { href: '/admin/door-desk', label: 'Door desk', icon: 'scan' },
    { href: '/admin/event-management', label: 'Event management', icon: 'calendar', minRole: 'check_in_staff', tourId: 'nav-events' },
    { href: '/admin/seating-plan', label: 'Event planner', icon: 'seating', minRole: 'event_manager' },
  ]},
  { label: 'Guest contact', items: [
    { href: '/admin/rsvp-management', label: 'RSVP management', icon: 'rsvp', minRole: 'event_manager' },
    { href: '/admin/preferences', label: 'Preferences', icon: 'clipboard', minRole: 'event_manager' },
    { href: '/admin/guest-messages', label: 'Guest messages', icon: 'message', minRole: 'check_in_staff', tourId: 'nav-whatsapp' },
    { href: '/admin/follow-ups', label: 'Follow-ups', icon: 'bell', minRole: 'check_in_staff', tourId: 'nav-reminders' },
  ]},
  { label: 'Creative studio', items: [
    { href: '/admin/rsvp-customization', label: 'RSVP customization', icon: 'design', minRole: 'super_admin' },
    { href: '/admin/pass-studio', label: 'Pass studio', icon: 'design', minRole: 'event_manager', tourId: 'nav-fonts' },
    { href: '/admin/message-library', label: 'Message library', icon: 'message', minRole: 'event_manager', tourId: 'nav-templates' },
    { href: '/admin/list-import', label: 'List import', icon: 'upload', minRole: 'event_manager' },
  ]},
  { label: 'Company', items: [
    { href: '/admin/company-profile', label: 'Company profile', icon: 'settings', minRole: 'super_admin' },
    { href: '/admin/domains', label: 'Domains', icon: 'globe', minRole: 'super_admin' },
    { href: '/admin/settings', label: 'Messaging settings', icon: 'settings', minRole: 'super_admin' },
    { href: '/admin/crew-access', label: 'Crew access', icon: 'team', minRole: 'super_admin', tourId: 'nav-team' },
    { href: '/admin/playbook', label: 'Playbook', icon: 'docs', minRole: 'check_in_staff' },
    { href: '/admin/delivery-monitor', label: 'Delivery monitor', icon: 'queue', minRole: 'super_admin', platformOnly: true },
  ]},
]

export function NavIcon({ name, size = 18 }: { name: AdminIconName; size?: number }) {
  const common = { width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, viewBox: '0 0 24 24' }
  switch (name) {
    case 'pulse': return <svg {...common}><path d="M3 12h4l2.2-5.2L13 18l2.2-6H21"/><path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/></svg>
    case 'calendar': return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>
    case 'guests': return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20M16 5.5a3 3 0 0 1 0 5.8M17 14a4 4 0 0 1 3.5 4V20"/></svg>
    case 'scan': return <svg {...common}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 9h2v2H8zM14 9h2v2h-2zM8 15h2v-2M14 13h2v2h-2z"/></svg>
    case 'rsvp': return <svg {...common}><path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="9"/></svg>
    case 'message': return <svg {...common}><path d="M21 14a4 4 0 0 1-4 4H9l-5 3v-5a6 6 0 0 1-1-3.3V9a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 10h8M8 13h5"/></svg>
    case 'bell': return <svg {...common}><path d="M18 9a6 6 0 0 0-12 0c0 6-3 7-3 7h18s-3-1-3-7M10 20h4"/></svg>
    case 'design': return <svg {...common}><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4M4 13V4h9"/></svg>
    case 'team': return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M17 8h4M19 6v4"/></svg>
    case 'settings': return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1-2.9 2.9-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.1h-4v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1-2.9-2.9.1-.1a1.6 1.6 0 0 0 .3-1.8A1.6 1.6 0 0 0 3.1 14H3v-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1 2.9-2.9.1.1a1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 1-1.5V3h4v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1 2.9 2.9-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1h.1v4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></svg>
    case 'queue': return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="11" cy="18" r="2" fill="currentColor" stroke="none"/></svg>
    case 'seating': return <svg {...common}><circle cx="12" cy="12" r="4"/><circle cx="12" cy="4.2" r="1.5"/><circle cx="19.8" cy="12" r="1.5"/><circle cx="12" cy="19.8" r="1.5"/><circle cx="4.2" cy="12" r="1.5"/><circle cx="17.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/><circle cx="6.5" cy="17.5" r="1.5"/><circle cx="6.5" cy="6.5" r="1.5"/></svg>
    case 'clipboard': return <svg {...common}><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z"/><path d="M8 6H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2"/><path d="M9 12h6M9 16h4"/></svg>
    case 'globe': return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
    case 'upload': return <svg {...common}><path d="M12 16V4m0 0L7 9m5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>
    default: return <svg {...common}><path d="M5 3h11l3 3v15H5z"/><path d="M9 11h6M9 15h6"/></svg>
  }
}
