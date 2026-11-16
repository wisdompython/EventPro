'use client'

import { useState, useEffect, useRef } from 'react'
import { api, Event, SeatingSection } from '@/lib/api'
import { useAuth, useRequireAuth } from '@/lib/auth'
import { ensureCsrfToken } from '@/lib/api/request'
import { importRecoveryKey, parseImportJobs, rememberImportJob, type ImportJobReference } from '@/lib/importRecovery'
import { UploadForm } from '@/components/bulk-upload/UploadForm'
import { UploadResults } from '@/components/bulk-upload/UploadResults'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminLoadError } from '@/components/admin/AdminLoadError'

interface UploadResult {
  upload_id: number
  event: number
  status: 'pending' | 'processing' | 'done' | 'failed'
  total_rows: number
  successful: number
  failed: number
  skipped: number
  replaced: number
  recipients_created: number
  assets_total: number
  assets_processed: number
  assets_failed: number
  error_message: string
  uploaded_at: string
  errors: { row: number; error?: string; errors?: string[] }[]
  skipped_items: { row: number; full_name: string; phone_number: string; reason: string }[]
  asset_warnings: { guest_id: string; name: string; qr: boolean; pass: boolean }[]
}

function eventRequiredCols(ev: Event | null): string[] {
  if (!ev) return ['full_name', 'phone_number']
  const base = ['full_name']
  const rf: string[] = ev.required_fields ?? []
  if (ev.whatsapp_enabled && !rf.includes('phone_number')) base.push('phone_number')
  return [...new Set([...base, ...rf])]
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

function updateImportUrl(eventId: number | null, uploadId?: number) {
  const url = new URL(window.location.href)
  if (eventId) url.searchParams.set('event', String(eventId))
  else url.searchParams.delete('event')
  if (uploadId) url.searchParams.set('upload', String(uploadId))
  else url.searchParams.delete('upload')
  url.searchParams.delete('replace')
  window.history.replaceState(window.history.state, '', url)
}

export default function BulkUploadPage() {
  useRequireAuth('event_manager')
  const { user } = useAuth()
  const [events, setEvents]           = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [submitting, setSubmitting]   = useState(false)
  const [result, setResult]           = useState<UploadResult | null>(null)
  const [error, setError]             = useState('')
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [seatingSections, setSeatingSections] = useState<SeatingSection[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [tracking, setTracking] = useState<ImportJobReference | null>(null)
  const [recentJobs, setRecentJobs] = useState<ImportJobReference[]>([])
  const [progressError, setProgressError] = useState('')
  const [progressAttempt, setProgressAttempt] = useState(0)
  const [formVersion, setFormVersion] = useState(0)
  const requestGeneration = useRef(0)
  const organizationId = user?.active_organization?.id
  const userId = user?.id
  const recoveryKey = userId && organizationId ? importRecoveryKey(userId, organizationId) : null

  useEffect(() => {
    if (!recoveryKey) return
    let cancelled = false
    requestGeneration.current++
    setLoading(true); setSubmitting(false); setLoadError(''); setResult(null); setTracking(null); setProgressError(''); setSelectedEvent(null)
    api.getEvents().then((items) => {
      if (cancelled) return
      setEvents(items)
      const params = new URLSearchParams(window.location.search)
      const eventId = Number(params.get('event'))
      const uploadId = Number(params.get('upload'))
      let recent: ImportJobReference[] = []
      try { recent = parseImportJobs(window.localStorage.getItem(recoveryKey)).filter((job) => items.some((item) => item.id === job.eventId)) } catch { /* Recovery links still work if local storage is unavailable. */ }
      setRecentJobs(recent)
      const restored = Number.isSafeInteger(uploadId) && uploadId > 0
        ? { uploadId, eventId }
        : recent.find((job) => !eventId || job.eventId === eventId)
      const destination = items.find((item) => item.id === (restored?.eventId || eventId)) ?? null
      setSelectedEvent(destination)
      if (restored && destination) {
        setTracking({ uploadId: restored.uploadId, eventId: destination.id })
        updateImportUrl(destination.id, restored.uploadId)
      } else if (uploadId) {
        setProgressError('This saved import link is incomplete or its event is unavailable. Open a recent import below to restore progress.')
      }
      setReplaceExisting(params.get('replace') === '1')
    }).catch(() => { if (!cancelled) setLoadError('Could not load events. Please retry before starting an import.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; requestGeneration.current++ }
  }, [recoveryKey, loadAttempt])

  useEffect(() => {
    let cancelled = false
    setSeatingSections([])
    if (selectedEvent) {
      api.getSeatingSections(selectedEvent.id)
        .then((items) => { if (!cancelled) setSeatingSections(items.filter((item) => item.kind === 'tables')) })
        .catch(() => { if (!cancelled) setSeatingSections([]) })
    }
    return () => { cancelled = true }
  }, [selectedEvent?.id])

  useEffect(() => {
    if (!tracking || result?.status === 'done' || result?.status === 'failed') return
    let stopped = false
    const controller = new AbortController()
    let timer: number | undefined
    let remembered = false
    async function poll() {
      let retry = true
      try {
        const response = await fetch(
          `${BASE_URL}/guests/bulk-upload-status/${tracking!.uploadId}/`,
          { credentials: 'include', signal: controller.signal },
        )
        const data = await response.json()
        if (!response.ok) {
          retry = ![401, 403, 404].includes(response.status)
          throw new Error(response.status === 404 ? 'This import is no longer available to your account in this workspace.' : data.detail || 'Could not read import progress.')
        }
        if (Number(data.event) !== tracking!.eventId || Number(data.upload_id) !== tracking!.uploadId) {
          retry = false
          throw new Error('This import does not belong to the selected event. Open its original progress link.')
        }
        if (!stopped) {
          setResult(data); setProgressError('')
          if (!remembered && recoveryKey) {
            try {
              const jobs = rememberImportJob(parseImportJobs(window.localStorage.getItem(recoveryKey)), tracking!)
              window.localStorage.setItem(recoveryKey, JSON.stringify(jobs))
              setRecentJobs(jobs)
            } catch { /* A bookmarkable URL remains available without local storage. */ }
            remembered = true
          }
        }
        retry = data.status === 'pending' || data.status === 'processing'
      } catch (err) {
        if (!stopped) setProgressError(err instanceof Error ? err.message : 'Could not refresh import progress. The import may still be running.')
      } finally {
        if (!stopped && retry) timer = window.setTimeout(poll, 2500)
      }
    }
    void poll()
    return () => { stopped = true; controller.abort(); window.clearTimeout(timer) }
  }, [tracking, result?.status, progressAttempt, recoveryKey])

  function remember(job: ImportJobReference) {
    if (!recoveryKey) return
    let next = rememberImportJob(recentJobs, job)
    try {
      next = rememberImportJob(parseImportJobs(window.localStorage.getItem(recoveryKey)), job)
      window.localStorage.setItem(recoveryKey, JSON.stringify(next))
    } catch { /* The URL is also a recovery link. */ }
    setRecentJobs(next)
    updateImportUrl(job.eventId, job.uploadId)
  }

  function startAnother() {
    requestGeneration.current++
    setTracking(null); setResult(null); setError(''); setProgressError(''); setReplaceExisting(false)
    setFormVersion((value) => value + 1)
    updateImportUrl(selectedEvent?.id ?? null)
  }

  function handleEventChange(id: string) {
    if (submitting) return
    const event = events.find((e) => String(e.id) === id) ?? null
    setSelectedEvent(event)
    updateImportUrl(event?.id ?? null)
  }

  const requiredCols = eventRequiredCols(selectedEvent)
  const optionalCols = ['email', 'ticket_type', 'seating_area', 'table_number', 'seat_number',
    ...(selectedEvent?.collect_aso_ebi ? ['aso_ebi_requested', 'aso_ebi_yards'] : []),
    ...(selectedEvent?.allow_plus_one ? ['plus_one_attending', 'plus_one_full_name', 'plus_one_phone_number'] : []),
  ].filter(
    (c) => !requiredCols.includes(c)
  )
  const ticketTypes = selectedEvent?.ticket_types as { value: string; label: string }[] | undefined

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting || tracking) return
    setError(''); setSubmitting(true)
    const current = requestGeneration.current
    const form = e.currentTarget
    const formData = new FormData()
    const eventId = (form.elements.namedItem('event') as HTMLSelectElement).value
    const file = (form.elements.namedItem('csv_file') as HTMLInputElement).files?.[0]
    if (!eventId) { setError('Please select an event.'); setSubmitting(false); return }
    if (!file)    { setError('Please select a CSV file.'); setSubmitting(false); return }
    formData.append('event', eventId)
    formData.append('csv_file', file)
    formData.append('replace_existing', String(replaceExisting))
    if (replaceExisting && !confirm(`Replace the entire guest list for "${selectedEvent?.name}"?\n\nExisting guests, RSVP responses, links, QR codes, and passes will be deleted only after the replacement CSV passes validation.`)) {
      setSubmitting(false)
      return
    }
    try {
      const csrf = await ensureCsrfToken()
      const res = await fetch(`${BASE_URL}/guests/bulk-upload/`, { method: 'POST', body: formData, credentials: 'include', headers: { 'X-CSRFToken': csrf } })
      const data = await res.json()
      if (requestGeneration.current !== current) return
      if (Number.isSafeInteger(data.upload_id) && Number(data.event) === Number(eventId)) {
        const job = { uploadId: data.upload_id, eventId: Number(eventId) }
        setResult(data); setTracking(job); remember(job)
        return
      }
      if (!res.ok) {
        const rowDetails = Array.isArray(data.errors)
          ? data.errors.slice(0, 5).map((item: { row?: number; error?: string; errors?: string[] }) => `Row ${item.row ?? '?'}: ${item.error ?? item.errors?.join(' ') ?? 'Invalid data'}`).join('\n')
          : ''
        const msg = data.detail
          ?? (data.csv_file ? (Array.isArray(data.csv_file) ? data.csv_file[0] : data.csv_file)
          : data.event ? (Array.isArray(data.event) ? data.event[0] : data.event)
          : JSON.stringify(data))
        throw new Error(rowDetails ? `${msg}\n${rowDetails}` : msg)
      }
      throw new Error('The import response was incomplete. Please check your guest list before uploading again.')
    } catch (err: unknown) {
      if (requestGeneration.current === current) setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally { if (requestGeneration.current === current) setSubmitting(false) }
  }

  return (
    <div className="admin-page admin-page--editor">
      <AdminPageHeader eyebrow="Creative studio" title="List import" description="Move from spreadsheet to event-ready guest records with validation, duplicate protection and a clear review step." />
      {error && <div role="alert" className="mb-5 whitespace-pre-line rounded-[14px] px-5 py-3.5 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' }}>{error}</div>}
      {loadError && <AdminLoadError message={loadError} onRetry={() => setLoadAttempt((value) => value + 1)} />}
      {loading && <p role="status" className="admin-surface mb-5 p-5 text-sm text-[var(--muted)]">Loading events and recent imports…</p>}
      {tracking && <div className="admin-surface mb-5 p-5">
        <h2 className="text-base font-semibold">Import for {selectedEvent?.name}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Import #{tracking.uploadId} · You can bookmark this page to return to its progress.</p>
      </div>}
      {progressError && <AdminLoadError message={progressError} onRetry={tracking ? () => setProgressAttempt((value) => value + 1) : undefined} />}
      {tracking && !result && !progressError && <p role="status" className="admin-surface mb-5 p-5 text-sm text-[var(--muted)]">Restoring import progress…</p>}
      {result && <UploadResults result={result} />}
      {result?.status === 'done' && selectedEvent && <a href={`/admin/guestbook?event=${selectedEvent.id}`} className="mb-5 inline-block text-sm font-semibold text-[var(--brand)]">View updated guest list &rarr;</a>}
      {tracking && (result?.status === 'done' || result?.status === 'failed' || (!result && progressError)) && <div className="mb-5"><button type="button" className="admin-secondary-action" onClick={startAnother}>Back to import setup</button><p className="mt-2 text-xs text-[var(--muted)]">The progress link remains in recent imports. Returning to setup does not repeat or cancel the import.</p></div>}
      {!loading && !loadError && !tracking && events.length === 0 && <p className="admin-surface mb-5 p-5 text-sm text-[var(--muted)]">Create an event before importing guests. <a href="/admin/event-management/add" className="font-semibold text-[var(--brand)]">Create event →</a></p>}
      {!loading && !loadError && !tracking && events.length > 0 && <>
      <div className="admin-editor-grid"><div className="admin-editor-main">
      <UploadForm
        key={formVersion}
        events={events} selectedEvent={selectedEvent} submitting={submitting || result?.status === 'pending' || result?.status === 'processing'}
        requiredCols={requiredCols} optionalCols={optionalCols} ticketTypes={ticketTypes}
        seatingSections={seatingSections}
        replaceExisting={replaceExisting} onReplaceExistingChange={setReplaceExisting}
        onSubmit={handleSubmit} onEventChange={handleEventChange}
      />
      </div><aside className="admin-editor-aside"><div className="admin-editor-guide"><h3>Before you import</h3><p>Use one row per guest. Column names must match the labels shown after you select an event.</p><ol><li><span>1</span>Choose the destination</li><li><span>2</span>Upload the CSV</li><li><span>3</span>Review the impact</li></ol></div><div className="admin-editor-guide"><h3>Designed to be safe</h3><p>Duplicate phone numbers are skipped during additive imports. Replacement imports validate completely before existing records change.</p></div></aside></div>
      </>}
      {!loading && !loadError && recentJobs.length > 0 && <section className="admin-surface mt-5 p-5" aria-labelledby="recent-imports-heading">
        <h2 id="recent-imports-heading" className="text-base font-semibold">Recent imports in this workspace</h2>
        <ul className="mt-3 divide-y divide-[var(--line)]">{recentJobs.map((job) => <li key={job.uploadId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span>{events.find((event) => event.id === job.eventId)?.name || `Event ${job.eventId}`} · Import #{job.uploadId}</span><a href={`/admin/list-import?event=${job.eventId}&upload=${job.uploadId}`} className="font-semibold text-[var(--brand)]">{tracking?.uploadId === job.uploadId ? 'Current progress link' : 'View progress'}</a></li>)}</ul>
      </section>}
    </div>
  )
}
