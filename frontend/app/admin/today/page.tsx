"use client"

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, Event, Guest, GuestListStats, RsvpStats } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { AdminLoadError } from '@/components/admin/AdminLoadError'
import './dashboard.css'

/** Distance to the event, in whole days, measured from the start of today. */
function daysUntil(iso: string): number {
  const target = new Date(iso)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - startOfToday.getTime()) / 86400000)
}

function countdownLabel(days: number, ended: boolean): string {
  if (ended) return 'Wrapped'
  if (days < 0) return 'Awaiting close-out'
  if (days === 0) return 'Doors open today'
  if (days === 1) return 'Tomorrow'
  return days + ' days out'
}

interface Exception {
  key: string
  count: number
  title: string
  detail: string
  action: string
  href: string
  severity: 'critical' | 'warning'
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, isScanner, can } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [activeEvent, setActiveEvent] = useState<Event | null>(null)
  const [stats, setStats] = useState<GuestListStats | null>(null)
  const [rsvpStats, setRsvpStats] = useState<RsvpStats | null>(null)
  const [recentArrivals, setRecentArrivals] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [reload, setReload] = useState(0)
  const [detailReload, setDetailReload] = useState(0)
  const [detailEventId, setDetailEventId] = useState<number | null>(null)

  useEffect(() => {
    if (isScanner) router.replace('/admin/door-desk')
  }, [isScanner, router])

  useEffect(() => {
    if (isScanner) return
    let cancelled = false
    setLoading(true)
    setError('')
    api.getEvents()
      .then((result) => {
        if (cancelled) return
        setEvents(result)
        const upcoming = [...result]
          .filter((event) => !event.is_ended)
          .sort((a, b) => +new Date(a.date) - +new Date(b.date))
        const requested = Number(new URLSearchParams(window.location.search).get('event'))
        setActiveEvent(result.find((event) => event.id === requested) ?? upcoming[0] ?? result[0] ?? null)
      })
      .catch(() => { if (!cancelled) setError('Could not load events. Your event list is unavailable.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload, isScanner])

  useEffect(() => {
    if (!activeEvent) { setStats(null); setRsvpStats(null); setRecentArrivals([]); return }
    let cancelled = false
    setDetailLoading(true)
    setDetailError('')
    setStats(null); setRsvpStats(null); setRecentArrivals([])
    const url = new URL(window.location.href)
    url.searchParams.set('event', String(activeEvent.id))
    window.history.replaceState(window.history.state, '', url)

    const workflowId = activeEvent.rsvp_workflow_id
    Promise.all([
      api.getGuests({ event: String(activeEvent.id), page_size: '1' }),
      api.getGuests({ event: String(activeEvent.id), ordering: '-checked_in', status: 'checked_in', page_size: '5' }),
      workflowId ? api.getRsvpStats(workflowId) : Promise.resolve(null),
    ])
      .then(([overview, arrivals, workflowStats]) => {
        if (cancelled) return
        setStats(overview.stats ?? null)
        setDetailEventId(activeEvent.id)
        setRecentArrivals(arrivals.results)
        setRsvpStats(workflowStats)
        if (!overview.stats) setDetailError('Guest status is unavailable. Retry to check this event.')
      })
      .catch(() => { if (!cancelled) setDetailError('Could not check guest and delivery status. Event readiness is unknown.') })
      .finally(() => { if (!cancelled) setDetailLoading(false) })

    return () => { cancelled = true }
  }, [activeEvent?.id, activeEvent?.rsvp_workflow_id, detailReload])

  /**
   * Work that will cost someone entry at the door if nobody acts on it.
   * Every count here is server-computed; nothing is estimated.
   */
  const exceptions = useMemo<Exception[]>(() => {
    if (!activeEvent) return []
    const list: Exception[] = []
    const workflowHref = activeEvent.rsvp_workflow_id ? '/admin/rsvp-management/' + activeEvent.rsvp_workflow_id : '/admin/rsvp-management'

    if (rsvpStats?.confirmed_no_pass) {
      list.push({
        key: 'confirmed_no_pass',
        count: rsvpStats.confirmed_no_pass,
        title: 'Confirmed without a pass',
        detail: 'They said yes but hold no QR pass, so the door cannot scan them in.',
        action: 'Send passes',
        href: workflowHref + '?segment=confirmed_no_pass',
        severity: 'critical',
      })
    }
    if (rsvpStats?.delivery_failed) {
      list.push({
        key: 'delivery_failed',
        count: rsvpStats.delivery_failed,
        title: 'WhatsApp delivery failed',
        detail: 'An invitation or pass bounced. Retry it or correct the phone number.',
        action: 'Review failures',
        href: workflowHref + '?segment=delivery_failed',
        severity: 'critical',
      })
    }
    if (!activeEvent.rsvp_workflow_id && stats?.wa_unsent) {
      list.push({
        key: 'wa_unsent',
        count: stats.wa_unsent,
        title: 'Never messaged',
        detail: 'No WhatsApp pass has gone out to these guests yet.',
        action: 'Open guest messages',
        href: '/admin/guest-messages',
        severity: 'warning',
      })
    }
    if (rsvpStats?.awaiting) {
      list.push({
        key: 'awaiting',
        count: rsvpStats.awaiting,
        title: 'Awaiting a reply',
        detail: 'Invitations landed, but these guests have not responded.',
        action: 'Send reminder',
        href: workflowHref + '?segment=invited_awaiting',
        severity: 'warning',
      })
    }
    return list
  }, [activeEvent, rsvpStats, stats])

  /** Delivery funnel. Each stage is a real count, not a share of an estimate. */
  const funnel = useMemo(() => {
    if (!activeEvent) return null
    const invited = rsvpStats?.invited ?? activeEvent.guest_count
    const confirmed = rsvpStats?.confirmed ?? activeEvent.confirmed_count
    const passes = rsvpStats?.passes_sent ?? stats?.wa_sent ?? 0
    const arrived = activeEvent.total_checked_in_count || activeEvent.checked_in_count
    const pct = (value: number) => (invited > 0 ? Math.round((value / invited) * 100) : 0)
    return {
      invited,
      stages: [
        { label: 'Invited', value: invited, pct: invited ? 100 : 0, tone: 'base' },
        { label: 'Confirmed', value: confirmed, pct: pct(confirmed), tone: 'brand' },
        { label: 'Pass delivered', value: passes, pct: pct(passes), tone: 'brand' },
        { label: 'Checked in', value: arrived, pct: pct(arrived), tone: 'success' },
      ],
    }
  }, [activeEvent, rsvpStats, stats])

  const firstName = user?.first_name || user?.username || 'there'
  const days = activeEvent ? daysUntil(activeEvent.date) : 0
  const criticalCount = exceptions.filter((item) => item.severity === 'critical').length
  const checkingDetails = detailLoading || (!detailError && detailEventId !== activeEvent?.id)

  const upcoming = useMemo(() => (
    [...events]
      .filter((event) => !event.is_ended && daysUntil(event.date) >= 0)
      .sort((a, b) => +new Date(a.date) - +new Date(b.date))
      .slice(0, 5)
  ), [events])

  if (loading) {
    return <div className="ops-board"><div className="ops-skeleton"><i /><i /><i /></div></div>
  }

  if (error) return <div className="ops-board"><AdminLoadError message={error} onRetry={() => setReload((value) => value + 1)} /></div>

  if (!activeEvent) {
    return (
      <div className="ops-board">
        <section className="ops-empty">
          <h2>Nothing to run yet</h2>
          <p>Create your first event, then bring in guests, send their passes, and work the door from here.</p>
          {can('event_manager') && <Link href="/admin/event-management/add" className="ops-btn">Create an event</Link>}
        </section>
      </div>
    )
  }

  return (
    <div className="ops-board">
      <header className="ops-head">
        <div className="ops-head__left">
          <p className="ops-eyebrow">Good day, {firstName}</p>
          {events.length > 1 ? (
            <div className="ops-event-choice">
              <span className="ops-event-choice__label">Active event</span>
              <SearchableSelect
                className="ops-event-picker"
                value={String(activeEvent.id)}
                onChange={(value) => setActiveEvent(events.find((item) => item.id === Number(value)) ?? activeEvent)}
                options={events.map((event) => ({
                  value: String(event.id),
                  label: event.name,
                  sublabel: [
                    new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(event.date)),
                    event.venue,
                  ].filter(Boolean).join(' · '),
                }))}
                searchPlaceholder="Find an event…"
                aria-label="Choose the event to manage"
              />
            </div>
          ) : <h2 className="ops-event-name">{activeEvent.name}</h2>}
          <p className="ops-event-meta">
            {new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(activeEvent.date))}
            {activeEvent.venue ? ' \u00b7 ' + activeEvent.venue : ''}
          </p>
        </div>

        <div className={'ops-countdown' + (days >= 0 && days <= 1 && !activeEvent.is_ended ? ' is-imminent' : '')}>
          <strong>{activeEvent.is_ended || days < 0 ? '\u2014' : days}</strong>
          <span>{countdownLabel(days, activeEvent.is_ended)}</span>
        </div>
      </header>

      <section className="ops-triage" aria-label="Needs attention">
        <div className="ops-triage__head">
          <h3>Needs attention</h3>
          {checkingDetails
            ? <span className="ops-triage__note">Checking\u2026</span>
            : detailError ? <span className="ops-triage__note">Status unavailable</span>
            : <span className={'ops-triage__note' + (criticalCount ? ' is-critical' : '')}>
                {exceptions.length === 0
                  ? 'Everything is on track'
                  : criticalCount + ' blocking \u00b7 ' + (exceptions.length - criticalCount) + ' to watch'}
              </span>}
        </div>

        {detailError ? <AdminLoadError message={detailError} onRetry={() => setDetailReload((value) => value + 1)} /> : checkingDetails ? <p className="ops-state" role="status">Checking guest and delivery status…</p> : exceptions.length === 0 ? (
          <div className="ops-clear">
            <p><b>No blockers.</b> Every confirmed guest has a pass and no messages have failed.</p>
            <Link href={`/admin/door-desk?event=${activeEvent.id}`}>Open door desk &rarr;</Link>
          </div>
        ) : (
          <ul className="ops-exceptions">
            {exceptions.map((item) => (
              <li key={item.key} className={'ops-exception is-' + item.severity}>
                <span className="ops-exception__count">{item.count}</span>
                <div className="ops-exception__body">
                  <b>{item.title}</b>
                  <small>{item.detail}</small>
                </div>
                <Link href={item.href} className="ops-exception__action">{item.action} &rarr;</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="ops-grid">
        <section className="ops-card" aria-label="Guest journey">
          <div className="ops-card__head">
            <h3>Guest journey</h3>
            <Link href={`/admin/guestbook?event=${activeEvent.id}`}>Open guestbook &rarr;</Link>
          </div>
          {checkingDetails ? <p role="status" className="ops-state">Loading guest journey…</p> : detailError ? <p className="ops-state">Guest journey unavailable.</p> : funnel && funnel.invited === 0 ? (
            <p className="ops-state">No guests yet. {can('event_manager') ? <><Link href={`/admin/list-import?event=${activeEvent.id}`}>Import a list</Link> to begin.</> : 'Ask an event manager to add guests.'}</p>
          ) : (
            <ol className="ops-funnel">
              {funnel?.stages.map((stage) => (
                <li key={stage.label} className={'is-' + stage.tone}>
                  <div className="ops-funnel__row">
                    <span>{stage.label}</span>
                    <b>{detailLoading ? '\u2014' : stage.value.toLocaleString()}</b>
                  </div>
                  <div className="ops-funnel__track"><i style={{ width: stage.pct + '%' }} /></div>
                  <em>{stage.pct}%</em>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="ops-card" aria-label="Recent arrivals">
          <div className="ops-card__head">
            <h3>Recent arrivals</h3>
            <Link href={`/admin/door-desk?event=${activeEvent.id}`}>Door desk &rarr;</Link>
          </div>
          {detailError ? <p className="ops-state">Recent arrivals unavailable.</p> : checkingDetails ? (
            <p className="ops-state">Loading\u2026</p>
          ) : recentArrivals.length === 0 ? (
            <p className="ops-state">Nobody has checked in yet. Arrivals appear here as they are scanned.</p>
          ) : (
            <ul className="ops-arrivals">
              {recentArrivals.map((guest) => (
                <li key={guest.id}>
                  <Link href={'/admin/guestbook/' + guest.id}>
                    <span className="ops-arrivals__name">{guest.full_name}</span>
                    <span className="ops-arrivals__seat">{guest.table_number ? 'Table ' + guest.table_number : 'No table'}</span>
                    <time>{guest.checked_in_at ? new Date(guest.checked_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '\u2014'}</time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ops-card" aria-label="Coming up">
          <div className="ops-card__head">
            <h3>Coming up</h3>
            <Link href="/admin/event-management">Event management &rarr;</Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="ops-state">No upcoming events scheduled.</p>
          ) : (
            <ul className="ops-upcoming">
              {upcoming.map((event) => {
                const d = daysUntil(event.date)
                return (
                  <li key={event.id}>
                    <Link href={'/admin/event-management/' + event.id} className={event.id === activeEvent.id ? 'is-current' : ''}>
                      <time dateTime={event.date}>
                        <b>{new Date(event.date).toLocaleDateString('en-GB', { day: '2-digit' })}</b>
                        <span>{new Date(event.date).toLocaleDateString('en-GB', { month: 'short' })}</span>
                      </time>
                      <div>
                        <b>{event.name}</b>
                        <small>{event.venue || 'Venue not set'}</small>
                      </div>
                      <em className={d <= 7 ? 'is-soon' : ''}>{d === 0 ? 'Today' : d === 1 ? '1d' : d + 'd'}</em>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
