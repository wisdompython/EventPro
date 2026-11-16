'use client'

import { useState, useEffect, useMemo } from 'react'
import { api, Guest, Event, SeatingSection } from '@/lib/api'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import './guest-messages.css'

function showInitials(name: string) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg"
      style={{ background: ok ? 'var(--brand)' : '#ef4444' }}>
      {msg}
    </div>
  )
}

// ── Message modal ────────────────────────────────────────────────────────────
function MessageModal({ guest, onClose }: { guest: Guest; onClose: () => void }) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSend() {
    if (!message.trim()) return
    setSending(true)
    setError('')
    try {
      await api.sendMessage(guest.id, message.trim())
      setSent(true)
      setTimeout(onClose, 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Message failed to send.')
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-[20px] overflow-hidden shadow-2xl"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{guest.full_name}</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{guest.phone_number}</p>
          </div>
          <button onClick={onClose} className="text-sm" style={{ color: 'var(--muted)' }}>✕</button>
        </div>
        <div className="p-5 space-y-3">
          {error ? (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </p>
          ) : (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>
              Only works within 24h of the guest messaging your business number first.
            </p>
          )}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Type your message…"
            className="w-full rounded-[12px] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
            style={{ background: 'var(--chip)', border: '1px solid var(--line)', color: 'var(--ink)' }}
          />
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 rounded-full py-2.5 text-sm font-semibold transition"
            style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}>
            Cancel
          </button>
          <button onClick={handleSend} disabled={sending || sent || !message.trim()}
            className="flex-1 rounded-full py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
            style={{ background: 'var(--brand)' }}>
            {sent ? 'Sent ✓' : sending ? 'Sending…' : 'Send Message'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bulk send confirm modal ──────────────────────────────────────────────────
function BulkSendModal({ guests, resend, totalCount, unsentCount, onConfirm, onClose }: {
  guests: Guest[]
  resend: boolean
  totalCount: number
  unsentCount: number
  onConfirm: () => void
  onClose: () => void
}) {
  const targetCount = resend ? totalCount : unsentCount
  const sample = (resend ? guests : guests.filter((g) => !g.whatsapp_sent)).slice(0, 5)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-[20px] overflow-hidden shadow-2xl"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3">
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>
            {resend ? 'Resend all passes' : `Send to ${targetCount} guest${targetCount !== 1 ? 's' : ''}`}
          </p>
          <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
            {resend
              ? `This will re-send the pass to all ${targetCount} guests in this event, including those already sent.`
              : `Queues WhatsApp pass delivery for ${targetCount} unsent guest${targetCount !== 1 ? 's' : ''} across all pages.`}
          </p>
          {sample.length > 0 && (
            <div className="rounded-[10px] overflow-hidden" style={{ border: '1px solid var(--line)' }}>
              <p className="px-3 py-2 text-[12px] font-semibold uppercase tracking-wider"
                style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)', color: 'var(--muted-2)' }}>
                Sample recipients {targetCount > 5 ? `(first 5 of ${targetCount})` : ''}
              </p>
              {sample.map((g) => (
                <div key={g.id} className="flex items-center gap-2.5 px-3 py-2"
                  style={{ borderBottom: '1px solid var(--line)' }}>
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                    style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                    {showInitials(g.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--ink)' }}>{g.full_name}</p>
                    <p className="text-[12px] font-mono" style={{ color: 'var(--muted-2)' }}>{g.phone_number}</p>
                  </div>
                  {g.whatsapp_sent && (
                    <span className="text-[12px]" style={{ color: 'var(--brand)' }}>Resend</span>
                  )}
                </div>
              ))}
              {targetCount > 5 && (
                <p className="px-3 py-2 text-[12px]" style={{ color: 'var(--muted)' }}>
                  + {targetCount - 5} more…
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-3 px-5 pb-5 pt-2">
          <button onClick={onClose} className="flex-1 rounded-full py-2.5 text-sm font-semibold"
            style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}>Cancel</button>
          <button onClick={() => { onConfirm(); onClose() }}
            className="flex-1 rounded-full py-2.5 text-sm font-semibold text-white"
            style={{ background: 'var(--brand)' }}>
            {resend ? `Resend all ${targetCount}` : `Send ${targetCount}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Resend confirm modal ─────────────────────────────────────────────────────
function ResendModal({ guest, onConfirm, onClose }: { guest: Guest; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-[20px] overflow-hidden shadow-2xl"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-5">
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>Resend pass to {guest.full_name}?</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Pass was already sent on {guest.whatsapp_sent_at ? new Date(guest.whatsapp_sent_at).toLocaleDateString() : 'a previous date'}. This will send it again.
          </p>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 rounded-full py-2.5 text-sm font-semibold"
            style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 rounded-full py-2.5 text-sm font-semibold text-white"
            style={{ background: 'var(--brand)' }}>Resend</button>
        </div>
      </div>
    </div>
  )
}

// ── Guest row ────────────────────────────────────────────────────────────────
function GuestRow({ guest, seatingArea, onSend, onMessage, sending, polling }: {
  guest: Guest
  seatingArea: string
  onSend: (g: Guest) => void
  onMessage: (g: Guest) => void
  sending: string | null
  polling: Set<string>
}) {
  const [showResend, setShowResend] = useState(false)
  const isPolling = polling.has(guest.id)

  function handleSendClick() {
    if (guest.whatsapp_sent) { setShowResend(true); return }
    onSend(guest)
  }

  return <>
    {showResend && <ResendModal guest={guest} onClose={() => setShowResend(false)} onConfirm={() => { setShowResend(false); onSend(guest) }} />}
    <div className="gm-guest-row">
      <div className="gm-guest-identity"><div className="gm-avatar">{showInitials(guest.full_name)}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--ink)]">{guest.full_name}</p><p className="mt-0.5 truncate text-xs text-[var(--muted)]">{guest.phone_number || 'No phone number'}</p></div></div>
      <div className="gm-row-detail"><span className="gm-detail-label">Access</span><strong>{guest.ticket_type || 'General'}</strong></div>
      <div className="gm-row-detail"><span className="gm-detail-label">Seating</span><strong>{guest.table_number ? `${seatingArea ? `${seatingArea} · ` : ''}${guest.table_number}${guest.seat_number ? ` / ${guest.seat_number}` : ''}` : 'Unassigned'}</strong></div>
      <div className="gm-row-detail"><span className="gm-detail-label">Arrival</span><span className={`gm-mini-status ${guest.status === 'checked_in' ? 'is-positive' : ''}`}>{guest.status === 'checked_in' ? 'Checked in' : 'Expected'}</span></div>
      <div className="gm-delivery-cell">
        {isPolling ? <span className="gm-delivery-status is-delivering"><i className="gm-spinner" />Delivering…</span> : guest.whatsapp_sent ? <span className="gm-delivery-status is-sent"><i />Sent {guest.whatsapp_sent_at ? new Date(guest.whatsapp_sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span> : <span className="gm-delivery-status is-pending"><i />Not sent</span>}
      </div>
      <div className="gm-row-actions">
        <button onClick={handleSendClick} disabled={sending === guest.id || isPolling} className={`gm-send-button ${guest.whatsapp_sent ? 'is-secondary' : ''}`}>{sending === guest.id ? '…' : guest.whatsapp_sent ? 'Resend' : 'Send pass'}</button>
        <button onClick={() => onMessage(guest)} title="Send a direct message" className="gm-message-button"><svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
      </div>
    </div>
  </>
}

const PAGE_SIZE = 50

// ── Main page ────────────────────────────────────────────────────────────────
export default function WhatsAppPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [guests, setGuests] = useState<Guest[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [eventSearch, setEventSearch] = useState('')
  const [waFilter, setWaFilter] = useState<'all' | 'sent' | 'unsent'>('all')
  const [ticketFilter, setTicketFilter] = useState('')
  const [attendanceFilter, setAttendanceFilter] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [ordering, setOrdering] = useState('-registered')
  const [seatingSections, setSeatingSections] = useState<SeatingSection[]>([])
  const [eventStats, setEventStats] = useState({ total: 0, sent: 0, unsent: 0 })
  const [guestsLoading, setGuestsLoading] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [polling, setPolling] = useState<Set<string>>(new Set())
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkModal, setBulkModal] = useState<{ resend: boolean } | null>(null)
  const [messageGuest, setMessageGuest] = useState<Guest | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const tableToArea = useMemo(() => new Map(seatingSections.flatMap((section) => section.tables.map((table) => [table.label, section.name] as const))), [seatingSections])
  const selectedAreaTables = areaFilter ? seatingSections.find((section) => section.name === areaFilter)?.tables ?? [] : seatingSections.flatMap((section) => section.tables)
  const activeFilterCount = [waFilter !== 'all', ticketFilter, attendanceFilter, areaFilter, tableFilter, debouncedSearch].filter(Boolean).length
  const deliveryPercent = eventStats.total ? Math.round((eventStats.sent / eventStats.total) * 100) : 0

  useEffect(() => {
    api.getEvents().then((items) => {
      setEvents(items)
      const eventId = Number(new URLSearchParams(window.location.search).get('event'))
      if (eventId) setSelectedEvent(items.find((item) => item.id === eventId) ?? null)
    }).catch(console.error).finally(() => setEventsLoading(false))
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setSeatingSections([])
    setEventStats({ total: 0, sent: 0, unsent: 0 })
    if (!selectedEvent) return
    api.getSeatingSections(selectedEvent.id).then((items) => setSeatingSections(items.filter((item) => item.kind === 'tables'))).catch(() => setSeatingSections([]))
    api.getGuests({ event: String(selectedEvent.id), page: '1', has_phone: '1' }).then((data) => setEventStats({ total: data.count, sent: data.stats?.wa_sent ?? 0, unsent: data.stats?.wa_unsent ?? 0 })).catch(console.error)
  }, [selectedEvent?.id])

  useEffect(() => { setPage(1) }, [selectedEvent?.id, debouncedSearch, waFilter, ticketFilter, attendanceFilter, areaFilter, tableFilter, ordering])

  function buildParams() {
    const params: Record<string, string> = { event: String(selectedEvent!.id), page: String(page), has_phone: '1' }
    if (debouncedSearch) params.search = debouncedSearch
    if (waFilter === 'sent') params.wa_sent = 'true'
    else if (waFilter === 'unsent') params.wa_sent = 'false'
    if (ticketFilter) params.ticket_type = ticketFilter
    if (attendanceFilter) params.status = attendanceFilter
    if (areaFilter) params.seating_area = areaFilter
    if (tableFilter) params.table_number = tableFilter
    if (ordering) params.ordering = ordering
    return params
  }

  useEffect(() => {
    if (!selectedEvent) return
    setGuestsLoading(true)
    api.getGuests(buildParams())
      .then((d) => {
        setGuests(d.results)
        setCount(d.count)
      })
      .catch(console.error)
      .finally(() => setGuestsLoading(false))
  }, [selectedEvent, page, debouncedSearch, waFilter, ticketFilter, attendanceFilter, areaFilter, tableFilter, ordering])

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  function refreshGuests() {
    if (!selectedEvent) return
    api.getGuests(buildParams())
      .then((d) => {
        setGuests(d.results)
        setCount(d.count)
      })
      .catch(console.error)
    api.getGuests({ event: String(selectedEvent.id), page: '1', has_phone: '1' })
      .then((data) => setEventStats({ total: data.count, sent: data.stats?.wa_sent ?? 0, unsent: data.stats?.wa_unsent ?? 0 }))
      .catch(console.error)
  }

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setWaFilter('all')
    setTicketFilter('')
    setAttendanceFilter('')
    setAreaFilter('')
    setTableFilter('')
    setOrdering('-registered')
  }

  async function handleSend(guest: Guest) {
    setSending(guest.id)
    try {
      await api.sendWhatsApp(guest.id)
      showToast(`Pass queued for ${guest.full_name}`, true)
      // Mark as polling and check every 4s for up to 32s
      setPolling((prev) => new Set(prev).add(guest.id))
      let attempts = 0
      const poll = async () => {
        attempts++
        try {
          const updated = await api.getGuest(guest.id)
          if (updated.whatsapp_sent) {
            setGuests((prev) => prev.map((g) => g.id === guest.id ? updated : g))
            setPolling((prev) => { const next = new Set(prev); next.delete(guest.id); return next })
            return
          }
        } catch {}
        if (attempts < 8) setTimeout(poll, 4000)
        else {
          setPolling((prev) => { const next = new Set(prev); next.delete(guest.id); return next })
          refreshGuests()
        }
      }
      setTimeout(poll, 4000)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Send failed', false)
    } finally { setSending(null) }
  }

  async function handleBulkSend(resend: boolean) {
    if (!selectedEvent) return
    setBulkSending(true)
    try {
      const res = await api.bulkSendWhatsApp(selectedEvent.id, resend)
      showToast(`Queued — task ${res.task_id?.slice(0, 8) ?? '?'}`, true)
      setTimeout(refreshGuests, 3000)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Bulk send failed', false)
    } finally { setBulkSending(false) }
  }

  const sent = eventStats.sent
  const unsent = eventStats.unsent
  const filteredEvents = events.filter((event) => `${event.name} ${event.venue}`.toLowerCase().includes(eventSearch.toLowerCase()))

  if (!selectedEvent) return <div className="admin-page gm-page">
    {toast && <Toast {...toast} />}
    <AdminPageHeader eyebrow="Guest contact" title="Guest messages" description="Choose an event, review delivery coverage and send personalized passes through WhatsApp." actions={<a href="/admin/event-management/add" className="admin-primary-action">+ New event</a>} />
    <section className="gm-event-browser">
      <div className="gm-section-heading"><div><span>Events</span><h2>Select a guest list</h2></div><div className="gm-search"><svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input data-tour="whatsapp-title" value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Search events or venues…" /></div></div>
      {eventsLoading ? <div className="gm-loading">Loading events…</div> : filteredEvents.length === 0 ? <div className="gm-empty"><strong>{events.length ? 'No matching events' : 'No events yet'}</strong><p>{events.length ? 'Try a different search.' : 'Create an event before sending guest passes.'}</p>{!events.length && <a href="/admin/event-management/add" className="admin-primary-action">Create event</a>}</div> : <div data-tour="whatsapp-event-table" className="gm-event-grid">{filteredEvents.map((event) => <button key={event.id} onClick={() => { setSelectedEvent(event); clearFilters() }} className="gm-event-card"><div className="gm-event-card__top"><span className={`gm-event-icon ${event.is_ended ? 'is-muted' : ''}`}>{new Date(event.date).toLocaleDateString('en-GB', { day: '2-digit' })}</span><span className={`gm-event-state ${event.whatsapp_enabled ? 'is-live' : ''}`}>{event.is_ended ? 'Ended' : event.whatsapp_enabled ? 'WhatsApp on' : 'Manual delivery'}</span></div><h3>{event.name}</h3><p>{new Date(event.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}{event.venue ? ` · ${event.venue}` : ''}</p><div className="gm-event-card__footer"><span><strong>{event.guest_count}</strong> guests</span><span>Open workspace →</span></div></button>)}</div>}
    </section>
  </div>

  return <div className="admin-page gm-page">
    {toast && <Toast {...toast} />}
    {messageGuest && <MessageModal guest={messageGuest} onClose={() => setMessageGuest(null)} />}
    {bulkModal && <BulkSendModal guests={guests} resend={bulkModal.resend} totalCount={eventStats.total} unsentCount={eventStats.unsent} onConfirm={() => handleBulkSend(bulkModal.resend)} onClose={() => setBulkModal(null)} />}

    <AdminPageHeader eyebrow="Guest contact" title={selectedEvent.name} description={`${new Date(selectedEvent.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}${selectedEvent.venue ? ` · ${selectedEvent.venue}` : ''}`} actions={<><button onClick={() => { setSelectedEvent(null); setGuests([]); setCount(0); clearFilters() }} className="admin-secondary-action">Change event</button>{unsent > 0 && <button data-tour="whatsapp-bulk-actions" onClick={() => setBulkModal({ resend: false })} disabled={bulkSending} className="admin-primary-action">{bulkSending ? 'Queueing…' : `Send ${unsent} pending`}</button>}</>} />

    <section className="gm-overview">
      <div className="gm-progress-card"><div className="gm-progress-card__copy"><span>Delivery coverage</span><strong>{deliveryPercent}%</strong><p>{eventStats.sent} of {eventStats.total} reachable guests have received their pass.</p></div><div className="gm-progress-track"><i style={{ width: `${deliveryPercent}%` }} /></div></div>
      <div className="gm-stat-card is-sent"><span>Delivered</span><strong>{sent}</strong><p>Pass sent successfully</p></div>
      <div className="gm-stat-card is-pending"><span>Pending</span><strong>{unsent}</strong><p>Still needs a pass</p></div>
      <div className="gm-stat-card"><span>Reachable</span><strong>{eventStats.total}</strong><p>Guests with phone numbers</p></div>
    </section>

    <section className="gm-workspace">
      <div className="gm-toolbar">
        <div className="gm-toolbar__top"><div><span>Recipients</span><h2>Delivery list</h2><p>{count} result{count === 1 ? '' : 's'}{activeFilterCount ? ` · ${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}` : ''}</p></div><div className="gm-toolbar__actions"><button onClick={() => setBulkModal({ resend: true })} disabled={bulkSending || eventStats.total === 0} className="admin-secondary-action">Resend all</button><a href={`/admin/list-import?event=${selectedEvent.id}`} className="admin-secondary-action">Import guests</a></div></div>
        <div className="gm-filter-row">
          <label className="gm-search gm-search--wide"><svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search guest name or phone…" /></label>
          <select aria-label="Ticket type" value={ticketFilter} onChange={(event) => setTicketFilter(event.target.value)}><option value="">All ticket types</option>{selectedEvent.ticket_types.map((ticket) => <option key={ticket.value} value={ticket.value}>{ticket.label}</option>)}</select>
          <select aria-label="Arrival status" value={attendanceFilter} onChange={(event) => setAttendanceFilter(event.target.value)}><option value="">Any arrival status</option><option value="registered">Expected</option><option value="checked_in">Checked in</option></select>
          <select aria-label="Sort guests" value={ordering} onChange={(event) => setOrdering(event.target.value)}><option value="-registered">Newest added</option><option value="registered">Oldest added</option><option value="name">Name A–Z</option><option value="-name">Name Z–A</option></select>
        </div>
        <div className="gm-filter-row gm-filter-row--secondary">
          <div className="gm-segmented" aria-label="Delivery status">{(['all', 'unsent', 'sent'] as const).map((filter) => <button key={filter} onClick={() => setWaFilter(filter)} className={waFilter === filter ? 'is-active' : ''}>{filter === 'all' ? `All ${eventStats.total}` : filter === 'unsent' ? `Pending ${eventStats.unsent}` : `Delivered ${eventStats.sent}`}</button>)}</div>
          {seatingSections.length > 0 && <><select aria-label="Seating area" value={areaFilter} onChange={(event) => { setAreaFilter(event.target.value); setTableFilter('') }}><option value="">All seating areas</option>{seatingSections.map((section) => <option key={section.id} value={section.name}>{section.name}</option>)}</select><select aria-label="Table" value={tableFilter} onChange={(event) => setTableFilter(event.target.value)}><option value="">All tables</option>{!areaFilter && <option value="__unassigned__">Unassigned guests</option>}{selectedAreaTables.map((table) => <option key={table.id} value={table.label}>{table.label}</option>)}</select></>}
          {activeFilterCount > 0 && <button onClick={clearFilters} className="gm-clear-filters">Clear filters ×</button>}
        </div>
      </div>

      <div className="gm-list-heading"><span>Guest</span><span>Access</span><span>Table & seat</span><span>Arrival</span><span>Delivery</span><span>Actions</span></div>
      <div className="gm-list">
        {guestsLoading ? <div className="gm-loading"><i className="gm-spinner" /> Loading recipients…</div> : guests.length === 0 ? <div className="gm-empty"><strong>{activeFilterCount ? 'No recipients match these filters' : 'No guests with phone numbers'}</strong><p>{activeFilterCount ? 'Clear one or more filters to broaden the result.' : 'Add phone numbers before sending WhatsApp passes.'}</p>{activeFilterCount > 0 ? <button onClick={clearFilters} className="admin-secondary-action">Clear filters</button> : <a href={`/admin/list-import?event=${selectedEvent.id}`} className="admin-primary-action">Import guests</a>}</div> : guests.map((guest) => <GuestRow key={guest.id} guest={guest} seatingArea={tableToArea.get(guest.table_number) ?? ''} sending={sending} polling={polling} onSend={handleSend} onMessage={setMessageGuest} />)}
      </div>

      {totalPages > 1 && <div className="gm-pagination"><p>Showing page {page} of {totalPages} · {count} recipients</p><div><button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>← Previous</button><span>{page}</span><button onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>Next →</button></div></div>}
    </section>
  </div>
}
