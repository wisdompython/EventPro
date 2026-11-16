'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { api, Guest, Event, GuestListStats } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import ExportDropdown from '@/components/ExportDropdown'
import { GuestFilterBar, GuestSortKey } from '@/components/guests/GuestFilterBar'
import { GuestTable } from '@/components/guests/GuestTable'
import { DownloadAssetsButton } from '@/components/guests/DownloadAssetsButton'
import { AdminLoadError } from '@/components/admin/AdminLoadError'
import { ConfirmDialog, type ConfirmRequest } from '@/components/admin/ConfirmDialog'

type FilterToken = { key: string; value: string }

function parseTokens(input: string): { tokens: FilterToken[]; freeText: string } {
  const tokens: FilterToken[] = []
  const freeTextParts: string[] = []
  const tokenPattern = /(^|\s+)(\w+):(\S+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = tokenPattern.exec(input)) !== null) {
    freeTextParts.push(input.slice(lastIndex, match.index))
    tokens.push({ key: match[2], value: match[3] })
    lastIndex = match.index + match[0].length
  }
  freeTextParts.push(input.slice(lastIndex))
  // Preserve trailing whitespace so typing a space does not get undone by the
  // controlled input on its next render. The API receives a trimmed copy.
  return { tokens, freeText: freeTextParts.join('').trimStart() }
}

export default function GuestsPage() {
  const { isSuperAdmin, can } = useAuth()
  const canManage = can('event_manager')
  const [events, setEvents]             = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)

  const [guests, setGuests]             = useState<Guest[]>([])
  const [count, setCount]               = useState(0)
  const [stats, setStats]               = useState<GuestListStats | null>(null)
  const [loading, setLoading]           = useState(false)
  const [query, setQuery]               = useState('')
  const [sort, setSort]                 = useState<GuestSortKey>('')
  const [registeredFrom, setRegisteredFrom] = useState('')
  const [registeredTo, setRegisteredTo]     = useState('')
  const [page, setPage]                 = useState(1)
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [deleting, setDeleting]         = useState<string | null>(null)
  const [deleteError, setDeleteError]   = useState('')
  const [regeneratingAll, setRegeneratingAll] = useState(false)
  const [regenToast, setRegenToast]     = useState('')
  const [eventsError, setEventsError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [reloadEvents, setReloadEvents] = useState(0)
  const [reloadGuests, setReloadGuests] = useState(0)
  const [confirmation, setConfirmation] = useState<ConfirmRequest | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const PAGE_SIZE = 50
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  const { tokens, freeText } = parseTokens(query)
  const searchTerm = freeText.trim()
  const statusToken = tokens.find((t) => t.key === 'status')?.value ?? ''
  const ticketToken = tokens.find((t) => t.key === 'ticket')?.value ?? ''
  const waToken     = tokens.find((t) => t.key === 'wa')?.value ?? ''
  const duplicatesToken = tokens.find((t) => t.key === 'duplicates')?.value ?? ''
  const rsvpToken = tokens.find((t) => t.key === 'rsvp')?.value ?? ''

  useEffect(() => {
    let cancelled = false
    setEventsLoading(true); setEventsError('')
    api.getEvents().then((items) => {
      if (cancelled) return
      setEvents(items)
      const requestedEventId = Number(new URLSearchParams(window.location.search).get('event'))
      if (requestedEventId) setSelectedEvent(items.find((item) => item.id === requestedEventId) ?? null)
    }).catch(() => { if (!cancelled) setEventsError('Could not load events. Please retry.') }).finally(() => { if (!cancelled) setEventsLoading(false) })
    return () => { cancelled = true }
  }, [reloadEvents])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (selectedEvent) url.searchParams.set('event', String(selectedEvent.id))
    else url.searchParams.delete('event')
    if (!eventsLoading) window.history.replaceState(window.history.state, '', url)
  }, [selectedEvent, eventsLoading])

  // reset to page 1 when filters or event changes
  useEffect(() => { setPage(1) }, [selectedEvent?.id, searchTerm, statusToken, ticketToken, waToken, duplicatesToken, rsvpToken, sort, registeredFrom, registeredTo])

  useEffect(() => {
    if (!selectedEvent) return
    let cancelled = false
    setLoading(true)
    setLoadError(''); setGuests([]); setStats(null)
    setSelected(new Set())
    const params: Record<string, string> = { event: String(selectedEvent.id), page: String(page) }
    if (searchTerm)  params.search      = searchTerm
    if (statusToken) params.status      = statusToken === 'pending' ? 'registered' : statusToken
    if (ticketToken) params.ticket_type = ticketToken
    if (duplicatesToken === 'phone') params.duplicate_phone = '1'
    if (rsvpToken) params.rsvp_status = rsvpToken
    if (waToken === 'failed')                           params.wa_sent = 'false'
    else if (waToken === 'sent' || waToken === 'read' || waToken === 'delivered') params.wa_sent = 'true'
    if (sort)           params.ordering          = sort
    if (registeredFrom) params.registered_after  = registeredFrom
    if (registeredTo)   params.registered_before = registeredTo
    api.getGuests(params)
      .then((data) => { if (!cancelled) { setGuests(data.results); setCount(data.count); setStats(data.stats ?? null) } })
      .catch(() => { if (!cancelled) setLoadError('Could not load this guest list. Please retry.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedEvent, searchTerm, statusToken, ticketToken, waToken, duplicatesToken, rsvpToken, sort, registeredFrom, registeredTo, page, reloadGuests])

  const filtered = guests

  function toggleSelect(id: string) {
    setSelected((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((g) => g.id)))
  }
  async function handleDelete(id: string, name: string) {
    if (!canManage) return
    if (!confirm(`Delete ${name}?\n\nTheir RSVP record, response link, QR code, and pass will also be removed. This cannot be undone.`)) return
    const guest = guests.find((item) => item.id === id)
    setDeleting(id)
    setDeleteError('')
    try {
      await api.deleteGuest(id)
      setGuests((current) => current.filter((item) => item.id !== id))
      setCount((current) => Math.max(0, current - 1))
      setSelected((current) => { const next = new Set(current); next.delete(id); return next })
      if (guest) {
        setStats((current) => current ? {
          ...current,
          checked_in: Math.max(0, current.checked_in - (guest.status === 'checked_in' ? 1 : 0)),
          pending: Math.max(0, current.pending - (
            guest.status !== 'checked_in'
            && (!current.has_rsvp || guest.rsvp_response_status === 'confirmed') ? 1 : 0
          )),
          wa_sent: Math.max(0, current.wa_sent - (guest.whatsapp_sent ? 1 : 0)),
          wa_unsent: Math.max(0, current.wa_unsent - (guest.whatsapp_sent ? 0 : 1)),
          confirmed: Math.max(0, current.confirmed - (guest.rsvp_response_status === 'confirmed' ? 1 : 0)),
          declined: Math.max(0, current.declined - (guest.rsvp_response_status === 'declined' ? 1 : 0)),
          awaiting: Math.max(0, current.awaiting - (
            guest.rsvp_response_status === 'awaiting'
            && (guest.rsvp_invitation_status === 'delivered' || guest.rsvp_invitation_status === 'read') ? 1 : 0
          )),
          delivery_failed: Math.max(0, current.delivery_failed - (
            guest.rsvp_invitation_status === 'failed' || guest.rsvp_pass_status === 'failed' ? 1 : 0
          )),
        } : current)
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : `Failed to remove ${name}.`)
    } finally {
      setDeleting(null)
    }
  }

  async function handleBulkDelete() {
    if (!canManage || selected.size === 0) return
    if (!confirm(`Delete ${selected.size} selected guest${selected.size !== 1 ? 's' : ''}?\n\nTheir RSVP records, response links, QR codes, and passes will also be removed. This cannot be undone.`)) return
    setDeleting('bulk')
    setDeleteError('')
    try {
      const { deleted } = await api.bulkDeleteGuests(Array.from(selected))
      setGuests((prev) => prev.filter((g) => !selected.has(g.id)))
      setCount((c) => c - deleted)
      setSelected(new Set())
      setReloadGuests((value) => value + 1)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete guests.')
    } finally { setDeleting(null) }
  }

  async function handleDeleteAll() {
    if (!selectedEvent || !canManage || deleting) return
    const event = selectedEvent
    setDeleting('checking-scope')
    setDeleteError('')
    try {
      const overview = await api.getGuests({ event: String(event.id), page_size: '1' })
      setConfirmation({
        title: `Delete the entire guest list for ${event.name}?`,
        body: `This deletes all ${overview.count} guests in this event, including guests hidden by your current filters. Their RSVP records, responses, links, QR codes, and passes will also be removed. The RSVP setup remains. This cannot be undone.`,
        confirmLabel: `Delete all ${overview.count} guests`,
        onConfirm: () => { void clearEntireList(event.id) },
      })
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not check the full guest-list size. Please retry.')
    } finally { setDeleting(null) }
  }

  async function clearEntireList(eventId: number) {
    setDeleting('all'); setDeleteError('')
    try {
      await api.deleteAllGuests(eventId)
      setSelected(new Set())
      setReloadEvents((value) => value + 1)
      setReloadGuests((value) => value + 1)
    } catch (err) { setDeleteError(err instanceof Error ? err.message : 'Failed to clear guests.') }
    finally { setDeleting(null) }
  }

  async function handleRegenerateAll() {
    if (!selectedEvent || !canManage) return
    if (!confirm(`Regenerate passes for the entire guest list in "${selectedEvent.name}", including guests hidden by filters? This may take a few minutes.`)) return
    setRegeneratingAll(true)
    try {
      const { queued } = await api.bulkRegenerateAssets(selectedEvent.id)
      setRegenToast(`Queued ${queued} pass${queued !== 1 ? 'es' : ''} for regeneration.`)
      setTimeout(() => setRegenToast(''), 5000)
    } catch {
      setDeleteError('Failed to queue regeneration.')
    } finally { setRegeneratingAll(false) }
  }

  const checkedIn = stats?.checked_in ?? 0
  const pending   = stats?.pending ?? 0

  // ── Event picker ──────────────────────────────────────────────────────────
  if (!selectedEvent) {
    return (
      <div className="admin-legacy-workspace flex h-screen flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
        <div className="flex flex-shrink-0 items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--line)', background: 'var(--sidebar)' }}>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Guestbook</h1>
            <Link href="/admin/guestbook/search" data-tour="guests-search-link"
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full transition hover:opacity-80"
              style={{ border: '1px solid var(--line)', color: 'var(--muted)', background: 'var(--panel)' }}>
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              Search all
            </Link>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-8">
          <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>Select an event to view its guest list.</p>

          {eventsLoading ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading events…</p>
          ) : eventsError ? <AdminLoadError message={eventsError} onRetry={() => setReloadEvents((value) => value + 1)} /> : events.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>No events yet.</p>
              {canManage && <Link href="/admin/event-management/add" className="text-sm font-semibold hover:underline" style={{ color: 'var(--brand)' }}>
                Create your first event →
              </Link>}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((ev, i) => (
                <button key={ev.id} onClick={() => setSelectedEvent(ev)} data-tour={i === 0 ? 'guests-pick-event' : undefined}
                  className="text-left rounded-[12px] px-5 py-4 transition hover:border-[var(--brand)]"
                  style={{ border: '1px solid var(--line)', background: 'var(--panel)' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--ink)' }}>{ev.name}</p>
                    {ev.is_ended && (
                      <span className="flex-shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold"
                        style={{ background: 'rgba(156,163,175,0.15)', color: 'var(--muted)' }}>Ended</span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {new Date(ev.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {ev.venue ? ` · ${ev.venue}` : ''}
                  </p>
                  <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--brand)' }}>
                    {ev.guest_count} guest{ev.guest_count !== 1 ? 's' : ''} →
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Guest list ─────────────────────────────────────────────────────────────
  return (
    <div className="admin-legacy-workspace flex h-screen flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      {regenToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 shadow-xl text-sm"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--brand)' }}>
          ✓ {regenToast}
        </div>
      )}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4"
        style={{ borderBottom: '1px solid var(--line)', background: 'var(--sidebar)' }}>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <button onClick={() => { setSelectedEvent(null); setQuery(''); setSort(''); setRegisteredFrom(''); setRegisteredTo(''); setGuests([]); setCount(0); setStats(null) }}
            className="text-xs font-semibold transition hover:opacity-70"
            style={{ color: 'var(--muted)' }}>
            ← Choose event
          </button>
          <span style={{ color: 'var(--line)' }}>/</span>
          <div className="flex min-w-0 flex-wrap items-baseline gap-3">
            <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
              {selectedEvent.name}
              <span className="ml-2 text-base font-normal" style={{ color: 'var(--muted)' }}>• {loading ? '…' : loadError ? '—' : count}</span>
            </h1>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {loadError ? 'Status unavailable' : loading ? 'Loading guest status…' : <>{checkedIn} checked in · {stats?.has_rsvp
                ? `${stats.confirmed} confirmed · ${stats.awaiting} awaiting · ${stats.declined} declined${stats.delivery_failed ? ` · ${stats.delivery_failed} failed` : ''}`
                : `${pending} pending`}</>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && selected.size > 0 && <button onClick={handleBulkDelete} disabled={!!deleting} className="admin-danger-action">{deleting === 'bulk' ? 'Deleting…' : `Delete ${selected.size} selected guests`}</button>}
          {canManage && <Link href={`/admin/guestbook/add?event=${selectedEvent.id}`} data-tour="guests-add-button" className="admin-primary-action">＋ Add guest</Link>}
          <details className="admin-action-menu">
            <summary className="admin-secondary-action">Event actions</summary>
            <div className="admin-action-menu__panel">
              <DownloadAssetsButton eventId={selectedEvent.id} eventName={selectedEvent.name} />
              <ExportDropdown events={[selectedEvent]} />
              {canManage && <>
                <Link href={`/admin/list-import?event=${selectedEvent.id}`} data-tour="guests-bulk-upload-button" className="admin-secondary-action">Import guest list</Link>
                <button onClick={handleRegenerateAll} disabled={regeneratingAll || loading || !!loadError} className="admin-secondary-action">{regeneratingAll ? 'Queuing…' : 'Regenerate all passes'}</button>
                <button onClick={handleDeleteAll} disabled={!!deleting || loading || !!loadError} className="admin-danger-action">{deleting === 'all' ? 'Deleting…' : deleting === 'checking-scope' ? 'Checking list size…' : 'Delete entire event guest list'}</button>
              </>}
            </div>
          </details>
        </div>
      </div>
      {confirmation && <ConfirmDialog {...confirmation} onCancel={() => setConfirmation(null)} />}

      {deleteError && (
        <div role="alert" className="flex items-center justify-between px-5 py-2 text-xs"
          style={{ background: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}>
          {deleteError}
          <button aria-label="Dismiss error" onClick={() => setDeleteError('')} className="ml-4 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      <GuestFilterBar
        tokens={tokens} freeText={freeText}
        filteredCount={filtered.length} totalCount={count} page={page} pageSize={PAGE_SIZE}
        selectedCount={selected.size}
        resultStatus={loading ? 'Loading guests…' : loadError ? 'Results unavailable' : undefined}
        inputRef={inputRef} onQueryChange={setQuery}
        sort={sort} onSortChange={setSort}
        registeredFrom={registeredFrom} registeredTo={registeredTo}
        onRegisteredFromChange={setRegisteredFrom} onRegisteredToChange={setRegisteredTo}
        ticketTypes={selectedEvent.ticket_types ?? []}
        hasRsvp={Boolean(selectedEvent.rsvp_workflow_id)}
      />

      <div className="flex-1 overflow-auto">
        {loadError ? <AdminLoadError message={loadError} onRetry={() => setReloadGuests((value) => value + 1)} /> : <GuestTable
          guests={filtered} loading={loading} query={query || registeredFrom || registeredTo}
          selected={selected} deleting={deleting} showPhone={isSuperAdmin} canManage={canManage}
          onToggleAll={toggleAll} onToggleSelect={toggleSelect}
          onDelete={handleDelete} onClearQuery={() => { setQuery(''); setSort(''); setRegisteredFrom(''); setRegisteredTo('') }}
        />}
      </div>

      {!loadError && !loading && count > 0 && (
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-3"
          style={{ borderTop: '1px solid var(--line)', background: 'var(--sidebar)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Page {page} of {totalPages} · {count} guests
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} aria-label="First page" disabled={page === 1}
              className="rounded px-2 py-1 text-xs transition disabled:opacity-30"
              style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded px-2.5 py-1 text-xs transition disabled:opacity-30"
              style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>‹ Prev</button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…')
                acc.push(p)
                return acc
              }, [])
              .map((p, i) => p === '…' ? (
                <span key={`ellipsis-${i}`} className="px-1 text-xs" style={{ color: 'var(--muted-2)' }}>…</span>
              ) : (
                <button key={p} onClick={() => setPage(p as number)}
                  className="min-w-[28px] rounded px-2 py-1 text-xs font-semibold transition"
                  style={{
                    background: page === p ? 'var(--brand)' : 'transparent',
                    color: page === p ? '#fff' : 'var(--muted)',
                    border: `1px solid ${page === p ? 'var(--brand)' : 'var(--line)'}`,
                  }}>{p}</button>
              ))}

            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="rounded px-2.5 py-1 text-xs transition disabled:opacity-30"
              style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>Next ›</button>
            <button onClick={() => setPage(totalPages)} aria-label="Last page" disabled={page === totalPages}
              className="rounded px-2 py-1 text-xs transition disabled:opacity-30"
              style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>»</button>
          </div>
        </div>
      )}
    </div>
  )
}
