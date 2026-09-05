'use client'

import { useEffect, useRef, useState } from 'react'

import { Event } from '@/lib/api'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { DateTimePicker } from '@/components/ui/DateTimePicker'
import AsoEbiYardSelector from '@/components/rsvp/AsoEbiYardSelector'

const field = 'form-control'
const select = 'form-control'
const labelCls = 'form-label'

const OPTIONAL_FIELDS = [
  { key: 'phone_number', label: 'Phone Number', type: 'tel',   placeholder: '+234 800 000 0000' },
  { key: 'email',        label: 'Email',         type: 'email', placeholder: 'optional' },
  { key: 'table_number', label: 'Table Number',  type: 'text',  placeholder: 'optional' },
  { key: 'seat_number',  label: 'Seat Number',   type: 'text',  placeholder: 'optional' },
] as const

interface Props {
  events: Event[]
  selectedEvent: Event | null
  submitting: boolean
  uniqueRequired: string[]
  ticketOptions: { value: string; label: string }[]
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onEventChange: (id: string) => void
  onCancel: () => void
}

export function GuestForm({
  events, selectedEvent, submitting, uniqueRequired, ticketOptions,
  onSubmit, onEventChange, onCancel,
}: Props) {
  const [asoEbiRequested, setAsoEbiRequested] = useState(false)
  const [asoEbiYards, setAsoEbiYards] = useState(2)
  const [plusOneAttending, setPlusOneAttending] = useState(false)
  const [flowStep, setFlowStep] = useState(1)
  const [flowError, setFlowError] = useState('')
  const [scheduledSendAt, setScheduledSendAt] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    setAsoEbiRequested(false)
    setAsoEbiYards(2)
    setPlusOneAttending(false)
    setFlowStep(1)
    setScheduledSendAt('')
  }, [selectedEvent?.id])

  function continueFlow() {
    setFlowError('')
    if (flowStep === 1 && !selectedEvent) {
      setFlowError('Choose an event before continuing.')
      return
    }
    const stage = formRef.current?.querySelector(`[data-flow-stage="${flowStep}"]`)
    const invalid = stage?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(':invalid')
    if (invalid) { invalid.reportValidity(); return }
    setFlowStep((current) => Math.min(3, current + 1))
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="form-card form-flow">
      <div className="form-flow__topline">
        <div><p>Guest setup</p><h2 data-tour="guest-form-header">{['Identity & event', 'Guest preferences', 'Delivery review'][flowStep - 1]}</h2></div>
        <strong>{flowStep}<span>/03</span></strong>
      </div>
      <div className="form-flow__progress" aria-label={`Step ${flowStep} of 3`}><i style={{ width: `${flowStep * 33.333}%` }} /></div>
      <div className="form-flow__steps" aria-label="Guest setup steps">
        {['Who', 'Preferences', 'Review'].map((label, index) => <button type="button" key={label} onClick={() => index + 1 < flowStep && setFlowStep(index + 1)} className={index + 1 === flowStep ? 'is-active' : index + 1 < flowStep ? 'is-complete' : ''}><span>{index + 1 < flowStep ? '✓' : index + 1}</span>{label}</button>)}
      </div>
      {flowError && <p className="form-flow__error" role="alert">{flowError}</p>}

      <div data-flow-stage="1" className={`form-flow__stage grid gap-4 p-6 sm:grid-cols-2 ${flowStep === 1 ? 'is-active' : ''}`}>
        <div className="sm:col-span-2">
          <label className={labelCls}>Full Name *</label>
          <input data-tour="guest-name-field" name="full_name" type="text" required placeholder="e.g. Adaeze Okonkwo" className={field} />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>Event *</label>
          <SearchableSelect
            data-tour="guest-event-select"
            options={events.map((ev) => ({
              value: String(ev.id),
              label: ev.name,
              sublabel: ev.date ? new Date(ev.date).toLocaleDateString() : undefined,
            }))}
            value={selectedEvent ? String(selectedEvent.id) : ''}
            onChange={onEventChange}
            placeholder="Select an event…"
            searchPlaceholder="Search events…"
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>Ticket Type</label>
          <select name="ticket_type" className={select}>
            {ticketOptions.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div data-flow-stage="2" className={`form-flow__stage grid gap-4 p-6 sm:grid-cols-2 ${flowStep === 2 ? 'is-active' : ''}`}>
        {OPTIONAL_FIELDS.map(({ key, label, type, placeholder }) => {
          const isRequired = uniqueRequired.includes(key)
          return (
            <div key={key}>
              <label className={labelCls}>
                {label} {isRequired ? '*' : <span className="normal-case font-normal tracking-normal" style={{ color: 'var(--muted-2)' }}>(optional)</span>}
              </label>
              <input name={key} type={type} required={isRequired}
                placeholder={isRequired ? placeholder.replace('optional', '') : placeholder}
                className={field} />
            </div>
          )
        })}

        {selectedEvent?.collect_aso_ebi && (
          <div className="sm:col-span-2 rounded-[14px] border border-[var(--line)] bg-[var(--bg)] p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                name="aso_ebi_requested"
                type="checkbox"
                checked={asoEbiRequested}
                onChange={(e) => setAsoEbiRequested(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
              />
              <span>
                <span className="block text-sm font-semibold text-[var(--ink)]">Guest wants Aso Ebi</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">Turn this on to record how many yards are needed.</span>
              </span>
            </label>
            {asoEbiRequested && (
              <div className="mt-4">
                <AsoEbiYardSelector name="aso_ebi_quantity" id="guest-aso-ebi-yards" value={asoEbiYards} onChange={setAsoEbiYards} />
              </div>
            )}
          </div>
        )}

        {selectedEvent?.allow_plus_one && (
          <div className="sm:col-span-2 rounded-[14px] border border-[var(--line)] bg-[var(--bg)] p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input name="plus_one_attending" type="checkbox" checked={plusOneAttending} onChange={(event) => setPlusOneAttending(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
              <span><span className="block text-sm font-semibold text-[var(--ink)]">Guest is bringing a plus one</span><span className="mt-1 block text-xs text-[var(--muted)]">Add their details so they receive their own QR pass.</span></span>
            </label>
            {plusOneAttending && <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className={labelCls}>Plus one name *</label><input name="plus_one_full_name" required placeholder="Full name" className={field} /></div><div><label className={labelCls}>WhatsApp phone number *</label><input name="plus_one_phone_number" type="tel" required placeholder="+234 800 000 0000" className={field} /></div></div>}
          </div>
        )}

        {selectedEvent?.collect_celebrant && (
          <div className="sm:col-span-2">
            <label className={labelCls}>Which celebrant?</label>
            {selectedEvent.celebrant_options.length ? <select name="celebrant_name" className={select}><option value="">Select a celebrant</option>{selectedEvent.celebrant_options.map((name) => <option key={name} value={name}>{name}</option>)}</select> : <input name="celebrant_name" placeholder="Enter celebrant name" className={field} />}
          </div>
        )}
      </div>

      <div data-flow-stage="3" className={`form-flow__stage grid gap-4 p-6 sm:grid-cols-2 ${flowStep === 3 ? 'is-active' : ''}`}>
        {selectedEvent?.whatsapp_enabled && (
          <div className="sm:col-span-2">
            <label className={labelCls}>
              Schedule pass send <span className="normal-case font-normal tracking-normal" style={{ color: 'var(--muted-2)' }}>(optional — leave blank to send immediately)</span>
            </label>
            <DateTimePicker name="scheduled_send_at" value={scheduledSendAt} onChange={setScheduledSendAt} />
          </div>
        )}

        {selectedEvent && <div className="form-flow__review sm:col-span-2">
          <div><span>Event</span><strong>{selectedEvent.name}</strong></div>
          <div><span>Pass delivery</span><strong>{selectedEvent.whatsapp_enabled ? 'WhatsApp enabled' : 'Manual delivery'}</strong></div>
          <div><span>Guest options</span><strong>{[selectedEvent.collect_aso_ebi && 'Aso Ebi', selectedEvent.allow_plus_one && 'Plus one', selectedEvent.collect_celebrant && 'Celebrant'].filter(Boolean).join(' · ') || 'Standard admission'}</strong></div>
        </div>}
      </div>

      <div className="form-flow__footer">
        <button type="button" onClick={() => flowStep === 1 ? onCancel() : setFlowStep((current) => current - 1)} className="admin-secondary-action">{flowStep === 1 ? 'Cancel' : '← Back'}</button>
        {flowStep < 3 ? <button type="button" onClick={continueFlow} className="admin-primary-action">Continue <span>→</span></button> : <button data-tour="guest-submit-button" type="submit" disabled={submitting} className="admin-primary-action disabled:opacity-60">{submitting ? 'Adding…' : 'Add guest'}</button>}
      </div>
    </form>
  )
}
