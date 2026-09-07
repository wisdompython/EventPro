'use client'

import { useState, useEffect } from 'react'
import { api, Event, SeatingSection } from '@/lib/api'
import { UploadForm } from '@/components/bulk-upload/UploadForm'
import { UploadResults } from '@/components/bulk-upload/UploadResults'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

interface UploadResult {
  upload_id: number
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

import { ensureCsrfToken } from '@/lib/api/request'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

export default function BulkUploadPage() {
  const [events, setEvents]           = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [submitting, setSubmitting]   = useState(false)
  const [result, setResult]           = useState<UploadResult | null>(null)
  const [error, setError]             = useState('')
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [seatingSections, setSeatingSections] = useState<SeatingSection[]>([])

  useEffect(() => {
    api.getEvents().then((items) => {
      setEvents(items)
      const params = new URLSearchParams(window.location.search)
      const eventId = Number(params.get('event'))
      if (eventId) setSelectedEvent(items.find((item) => item.id === eventId) ?? null)
      setReplaceExisting(params.get('replace') === '1')
    }).catch(console.error)
  }, [])

  useEffect(() => {
    setSeatingSections([])
    if (selectedEvent) {
      api.getSeatingSections(selectedEvent.id)
        .then((items) => setSeatingSections(items.filter((item) => item.kind === 'tables')))
        .catch(() => setSeatingSections([]))
    }
  }, [selectedEvent?.id])

  useEffect(() => {
    if (!result || result.status === 'done' || result.status === 'failed') return
    let stopped = false
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(
          `${BASE_URL}/guests/bulk-upload-status/${result.upload_id}/`,
          { credentials: 'include' },
        )
        const data = await response.json()
        if (!response.ok) throw new Error(data.detail || 'Could not read import progress.')
        if (!stopped) setResult(data)
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : 'Could not read import progress.')
      }
    }, 2000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [result?.upload_id, result?.status])

  function handleEventChange(id: string) {
    const event = events.find((e) => String(e.id) === id) ?? null
    setSelectedEvent(event)
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
    e.preventDefault(); setError(''); setResult(null); setSubmitting(true)
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
      setResult(data)
      const fileInput = form.elements.namedItem('csv_file') as HTMLInputElement
      if (fileInput) fileInput.value = ''
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally { setSubmitting(false) }
  }

  return (
    <div className="admin-page admin-page--editor">
      <AdminPageHeader eyebrow="Creative studio" title="List import" description="Move from spreadsheet to event-ready guest records with validation, duplicate protection and a clear review step." />
      {error && <div className="mb-5 rounded-[14px] px-5 py-3.5 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' }}>{error}</div>}
      {result && <UploadResults result={result} />}
      {result?.status === 'done' && selectedEvent && <a href={`/admin/guestbook?event=${selectedEvent.id}`} className="mb-5 inline-block text-sm font-semibold text-[var(--brand)]">View updated guest list &rarr;</a>}
      <div className="admin-editor-grid"><div className="admin-editor-main">
      <UploadForm
        events={events} selectedEvent={selectedEvent} submitting={submitting || result?.status === 'pending' || result?.status === 'processing'}
        requiredCols={requiredCols} optionalCols={optionalCols} ticketTypes={ticketTypes}
        seatingSections={seatingSections}
        replaceExisting={replaceExisting} onReplaceExistingChange={setReplaceExisting}
        onSubmit={handleSubmit} onEventChange={handleEventChange}
      />
      </div><aside className="admin-editor-aside"><div className="admin-editor-guide"><h3>Before you import</h3><p>Use one row per guest. Column names must match the labels shown after you select an event.</p><ol><li><span>1</span>Choose the destination</li><li><span>2</span>Upload the CSV</li><li><span>3</span>Review the impact</li></ol></div><div className="admin-editor-guide"><h3>Designed to be safe</h3><p>Duplicate phone numbers are skipped during additive imports. Replacement imports validate completely before existing records change.</p></div></aside></div>
    </div>
  )
}
