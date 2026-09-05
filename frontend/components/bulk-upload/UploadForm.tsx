'use client'

import { useRef, useState } from 'react'
import { Event } from '@/lib/api'

interface Props {
  events: Event[]
  selectedEvent: Event | null
  submitting: boolean
  requiredCols: string[]
  optionalCols: string[]
  ticketTypes: { value: string; label: string }[] | undefined
  replaceExisting: boolean
  onReplaceExistingChange: (replace: boolean) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onEventChange: (id: string) => void
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function UploadForm({
  events, selectedEvent, submitting, requiredCols, optionalCols, ticketTypes,
  replaceExisting, onReplaceExistingChange, onSubmit, onEventChange,
}: Props) {
  const [step, setStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [flowError, setFlowError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function continueFlow() {
    setFlowError('')
    if (step === 1 && !selectedEvent) { setFlowError('Select the event this guest list belongs to.'); return }
    if (step === 2 && !file) { setFlowError('Choose a CSV file before continuing.'); return }
    setStep((current) => Math.min(3, current + 1))
  }

  return (
    <form onSubmit={onSubmit} className="form-card form-flow import-flow">
      <div className="form-flow__topline">
        <div><p>Guest list import</p><h2 data-tour="bulk-upload-header">{['Choose destination', 'Add your guest file', 'Review import'][step - 1]}</h2></div>
        <strong>{step}<span>/03</span></strong>
      </div>
      <div className="form-flow__progress"><i style={{ width: `${step * 33.333}%` }}/></div>
      <div className="form-flow__steps">
        {['Destination', 'CSV file', 'Review'].map((label, index) => <button type="button" key={label} onClick={() => index + 1 < step && setStep(index + 1)} className={index + 1 === step ? 'is-active' : index + 1 < step ? 'is-complete' : ''}><span>{index + 1 < step ? '✓' : index + 1}</span>{label}</button>)}
      </div>
      {flowError && <p className="form-flow__error" role="alert">{flowError}</p>}

      <section className={`form-flow__stage import-flow__stage ${step === 1 ? 'is-active' : ''}`}>
        <div className="import-flow__intro"><span>01</span><div><h3>Where should these guests go?</h3><p>Select an event and decide whether this file adds guests or replaces the current list.</p></div></div>
        <label className="form-label" htmlFor="bulk-event-select">Event</label>
        <select id="bulk-event-select" data-tour="bulk-event-select" name="event" required value={selectedEvent?.id ?? ''} className="form-control" onChange={(event) => onEventChange(event.target.value)}>
          <option value="">Select an event…</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
        </select>
        <div className="import-flow__choices">
          <label className={`import-flow__choice ${!replaceExisting ? 'is-selected' : ''}`}><input type="radio" name="upload_action" checked={!replaceExisting} onChange={() => onReplaceExistingChange(false)}/><span><b>Add new guests</b><small>Keep the current list. Duplicate phone numbers are skipped safely.</small></span><i>Recommended</i></label>
          <label className={`import-flow__choice ${replaceExisting ? 'is-selected is-dangerous' : ''}`}><input type="radio" name="upload_action" checked={replaceExisting} onChange={() => onReplaceExistingChange(true)}/><span><b>Replace the list</b><small>Validate first, then remove the old guests and RSVP records.</small></span></label>
        </div>
        {replaceExisting && <div className="import-flow__warning"><b>Replacement safeguard</b><p>The existing list remains untouched if any CSV row fails validation.</p></div>}
      </section>

      <section className={`form-flow__stage import-flow__stage ${step === 2 ? 'is-active' : ''}`}>
        <div className="import-flow__intro"><span>02</span><div><h3>Upload a clean CSV</h3><p>We will validate column names and guest details before changing the event.</p></div></div>
        <div className="import-flow__schema">
          <div><span>Required columns</span><p>{requiredCols.map((column) => <code key={column}>{column}</code>)}</p></div>
          <div><span>Optional columns</span><p>{optionalCols.map((column) => <code key={column}>{column}</code>)}</p></div>
          {ticketTypes?.length ? <div><span>Ticket values</span><p>{ticketTypes.map((ticket) => <code key={ticket.value}>{ticket.value}</code>)}</p></div> : null}
        </div>
        <label className={`import-dropzone ${file ? 'has-file' : ''}`}>
          <input ref={fileRef} data-tour="bulk-csv-input" name="csv_file" type="file" accept=".csv,text/csv" required onChange={(event) => { const next = event.target.files?.[0] ?? null; setFile(next); setFlowError('') }}/>
          {file ? <><span className="import-dropzone__icon">✓</span><strong>{file.name}</strong><small>{formatBytes(file.size)} · Ready to validate</small><em>Choose a different file</em></> : <><span className="import-dropzone__icon">CSV</span><strong>Drop your guest list here</strong><small>or click to browse your computer</small><em>.CSV files only</em></>}
        </label>
        <p className="import-flow__privacy">Your file is validated for this event before any guest records are changed.</p>
      </section>

      <section className={`form-flow__stage import-flow__stage ${step === 3 ? 'is-active' : ''}`}>
        <div className="import-flow__intro"><span>03</span><div><h3>Confirm the import</h3><p>Review the destination and impact before we process the file.</p></div></div>
        <div className="form-flow__review">
          <div><span>Event</span><strong>{selectedEvent?.name || 'Not selected'}</strong></div>
          <div><span>Import action</span><strong>{replaceExisting ? 'Replace the entire guest list' : 'Add new guests to the current list'}</strong></div>
          <div><span>CSV file</span><strong>{file ? `${file.name} · ${formatBytes(file.size)}` : 'No file selected'}</strong></div>
          <div><span>Delivery</span><strong>{selectedEvent?.whatsapp_enabled ? 'Event WhatsApp rules will apply' : 'No automatic WhatsApp delivery'}</strong></div>
        </div>
        <div className="import-flow__assurance"><span>✓</span><p><b>Validation happens first.</b> Invalid rows are reported clearly, and replacement imports do not remove existing guests until validation succeeds.</p></div>
      </section>

      <footer className="form-flow__footer">
        <button type="button" onClick={() => step === 1 ? history.back() : setStep((current) => current - 1)} className="admin-secondary-action">{step === 1 ? 'Cancel' : '← Back'}</button>
        {step < 3 ? <button type="button" onClick={continueFlow} className="admin-primary-action">Continue →</button> : <button data-tour="bulk-submit-button" type="submit" disabled={submitting} className="admin-primary-action disabled:opacity-60">{submitting ? 'Processing…' : replaceExisting ? 'Validate & replace list' : 'Import guests'}</button>}
      </footer>
    </form>
  )
}
