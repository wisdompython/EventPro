'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, WhatsAppTemplate } from '@/lib/api'
import { watDateTimeInputToIso } from '@/lib/datetime'
import type { TicketTypeDef } from '@/components/EventConfigPanel'
import { EventDetailsForm } from '@/components/events/EventDetailsForm'
import { GuestConfigSection } from '@/components/events/GuestConfigSection'
import { FormSectionHeader } from '@/components/ui/FormSectionHeader'
import { DateTimePicker } from '@/components/ui/DateTimePicker'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ensureCsrfToken } from '@/lib/api/request'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

const DEFAULT_TICKET_TYPES: TicketTypeDef[] = [
  { value: 'general', label: 'General' },
  { value: 'vip', label: 'VIP' },
  { value: 'vvip', label: 'VVIP' },
]

type ResponsePlan = 'rsvp' | 'preferences' | 'none'

const RESPONSE_OPTIONS: Array<{ value: ResponsePlan; title: string; description: string; note: string }> = [
  {
    value: 'rsvp',
    title: 'Confirm attendance',
    description: 'Ask every guest “Will you attend?” before releasing their pass.',
    note: 'Best when capacity, catering and attendance numbers matter.',
  },
  {
    value: 'preferences',
    title: 'Collect guest choices only',
    description: 'Gather planning details without asking guests to confirm attendance.',
    note: 'Useful for options such as Aso Ebi, plus-one details or celebrant selection.',
  },
  {
    value: 'none',
    title: 'No guest response needed',
    description: 'Register guests and send passes without a response form.',
    note: 'Best for confirmed lists or events where attendance is already known.',
  },
]

const STEP_LABELS = ['Response plan', 'Event details', 'Guest setup', 'Delivery', 'Review']

export default function AddEventPage() {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [responsePlan, setResponsePlan] = useState<ResponsePlan | null>(null)
  const [reviewConfirmed, setReviewConfirmed] = useState(false)
  const [ticketTypes, setTicketTypes] = useState<TicketTypeDef[]>(DEFAULT_TICKET_TYPES)
  const [requiredFields, setRequiredFields] = useState<string[]>(['phone_number'])
  const [whatsappEnabled, setWhatsappEnabled] = useState(true)
  const [collectAsoEbi, setCollectAsoEbi] = useState(false)
  const [allowPlusOne, setAllowPlusOne] = useState(false)
  const [plusOneLabel, setPlusOneLabel] = useState('')
  const [asoEbiLabel, setAsoEbiLabel] = useState('')
  const [asoEbiUnit, setAsoEbiUnit] = useState('')
  const [collectCelebrant, setCollectCelebrant] = useState(false)
  const [celebrantOptions, setCelebrantOptions] = useState<string[]>([])
  const [whatsappTemplate, setWhatsappTemplate] = useState<number | null>(null)
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>([])
  const [dateValid, setDateValid] = useState(false)
  const [passTiming, setPassTiming] = useState<'immediate' | 'scheduled'>('immediate')
  const [passSendAt, setPassSendAt] = useState('')

  useEffect(() => {
    api.getWhatsAppTemplates().then(setWaTemplates).catch(console.error)
  }, [])

  function chooseResponsePlan(plan: ResponsePlan) {
    setResponsePlan(plan)
    setReviewConfirmed(false)
    if (plan === 'rsvp') setWhatsappEnabled(true)
  }

  function validateStage(stageNumber: number) {
    const stage = formRef.current?.querySelector(`[data-flow-stage="${stageNumber}"]`)
    const invalid = stage?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(':invalid')
    if (invalid) {
      invalid.reportValidity()
      return false
    }
    return true
  }

  /** Never let a field submit or advance the whole wizard implicitly.
   *  Child controls such as "add ticket category" handle Enter themselves;
   *  moving between cards remains an explicit Continue-button action. */
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter' || e.defaultPrevented) return
    const target = e.target as HTMLElement
    if (target instanceof HTMLTextAreaElement) return
    if (target instanceof HTMLButtonElement) return
    e.preventDefault()
  }

  function continueSetup() {
    setError('')
    if (step === 1 && !responsePlan) {
      setError('Choose what guests should respond to before continuing.')
      return
    }
    if (step === 2 && (!validateStage(2) || !dateValid)) {
      if (!dateValid) setError('Please set a future date and time for the event.')
      return
    }
    if (step === 4 && responsePlan !== 'rsvp' && whatsappEnabled && passTiming === 'scheduled' && !passSendAt) {
      setError('Choose a date and time for scheduled guest-pass delivery.')
      return
    }
    if (step === 4) setReviewConfirmed(false)
    setStep((current) => Math.min(5, current + 1))
  }

  function fieldValue(form: HTMLFormElement, name: string, fallback = '') {
    return (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? fallback
  }

  async function createEvent() {
    if (step !== 5 || !reviewConfirmed || !responsePlan || !formRef.current) return
    if (!dateValid || !validateStage(2)) {
      setError('Review the required event details before creating this event.')
      setStep(2)
      return
    }

    const usesRsvp = responsePlan === 'rsvp'
    const usesPreferences = responsePlan === 'preferences'
    const form = formRef.current
    const fd = new FormData()
    fd.append('name', fieldValue(form, 'name'))
    fd.append('date', watDateTimeInputToIso(fieldValue(form, 'date')))
    fd.append('venue', fieldValue(form, 'venue'))
    fd.append('description', fieldValue(form, 'description'))
    fd.append('rsvp_message', usesRsvp ? fieldValue(form, 'rsvp_message') : '')
    fd.append('color_of_day', usesRsvp ? fieldValue(form, 'color_of_day') : '')
    const rsvpColours: Record<string, string> = {
      rsvp_primary_color: '#8a6f2b',
      rsvp_background_color: '#f6f4ee',
      rsvp_card_color: '#ffffff',
      rsvp_text_color: '#23262e',
    }
    for (const [colourField, fallback] of Object.entries(rsvpColours)) {
      fd.append(colourField, usesRsvp ? fieldValue(form, colourField, fallback) : fallback)
    }
    if (usesRsvp) {
      const rsvpBackground = (form.elements.namedItem('rsvp_background_image') as HTMLInputElement | null)?.files?.[0]
      if (rsvpBackground) fd.append('rsvp_background_image', rsvpBackground)
    }
    fd.append('ticket_types', JSON.stringify(ticketTypes))
    fd.append('required_fields', JSON.stringify(requiredFields))
    fd.append('whatsapp_enabled', String(whatsappEnabled))
    fd.append('collect_aso_ebi', String(responsePlan !== 'none' && collectAsoEbi))
    fd.append('allow_plus_one', String(responsePlan !== 'none' && allowPlusOne))
    fd.append('preferences_enabled', String(usesPreferences))
    fd.append('collect_celebrant', String(responsePlan !== 'none' && collectCelebrant))
    fd.append('celebrant_options', JSON.stringify(responsePlan !== 'none' ? celebrantOptions : []))
    if (whatsappTemplate) fd.append('whatsapp_template', String(whatsappTemplate))
    fd.append('create_rsvp_workflow', String(usesRsvp))
    if (!usesRsvp && whatsappEnabled && passTiming === 'scheduled' && passSendAt) {
      fd.append('pass_send_at', new Date(passSendAt).toISOString())
    }

    setError('')
    setSubmitting(true)
    try {
      const csrf = await ensureCsrfToken()
      const res = await fetch(`${BASE_URL}/events/`, { method: 'POST', body: fd, credentials: 'include', headers: { 'X-CSRFToken': csrf } })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail.detail ?? JSON.stringify(detail))
      }
      const created = await res.json() as { id: number }
      router.push(usesRsvp ? `/admin/rsvp-management/add?event=${created.id}` : `/admin/event-management/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event.')
      setSubmitting(false)
    }
  }

  const responsePlanLabel = RESPONSE_OPTIONS.find((option) => option.value === responsePlan)?.title ?? 'Not selected'
  const enabledChoices = [allowPlusOne && 'Plus one', collectAsoEbi && 'Aso Ebi', collectCelebrant && 'Celebrant selection'].filter(Boolean)
  const deliveryLabel = responsePlan === 'rsvp'
    ? 'RSVP invitation first; confirmed passes are configured next'
    : !whatsappEnabled
      ? 'WhatsApp delivery is off'
      : passTiming === 'scheduled' && passSendAt
        ? `Passes scheduled for ${new Date(passSendAt).toLocaleString('en-GB')}`
        : 'Passes sent when guests are added'

  return (
    <div className="admin-page admin-page--editor">
      <AdminPageHeader eyebrow="Event builder" title="Create an event" description="Decide what guests need to confirm first, then configure only the pages and delivery settings that apply." />
      <div className="admin-editor-grid">
        <div className="admin-editor-main">
          <div className="mb-4 grid gap-2 rounded-2xl border border-[var(--line)] bg-white p-2 sm:grid-cols-5">
            {STEP_LABELS.map((label, index) => {
              const number = index + 1
              return <button type="button" key={label} disabled={number > step} onClick={() => number <= step && setStep(number)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition disabled:cursor-default ${number === step ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--ink)]' : 'border-[var(--line)] bg-[var(--panel)] text-[var(--muted)]'}`}><span className="font-semibold text-[var(--brand)]">{number}</span><span>{label}</span>{number < step && <span className="ml-auto text-emerald-700">✓</span>}</button>
            })}
          </div>

          {error && <div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-3.5 text-sm text-[var(--danger)]">{error}</div>}

          <form ref={formRef} onSubmit={(event) => event.preventDefault()} onKeyDown={handleFormKeyDown} className="form-flow space-y-4">
            <div data-flow-stage="1" className={`form-flow__stage ${step === 1 ? 'is-active' : ''}`}>
              <div className="form-card">
                <FormSectionHeader step={1} title="What should guests respond to?" description="Make this decision first. The builder will hide RSVP settings that do not apply." />
                <div className="grid gap-3 p-5 sm:p-6">
                  {RESPONSE_OPTIONS.map((option) => <label key={option.value} className={`form-choice ${responsePlan === option.value ? 'form-choice--selected' : ''}`}><span className="flex items-start gap-3"><input type="radio" name="response_plan" value={option.value} checked={responsePlan === option.value} onChange={() => chooseResponsePlan(option.value)} className="mt-1 accent-[var(--brand)]"/><span><span className="block text-sm font-semibold text-[var(--ink)]">{option.title}</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{option.description}</span><span className="mt-2 block text-[11px] font-medium text-[var(--brand)]">{option.note}</span></span></span></label>)}
                </div>
              </div>
            </div>

            <div data-flow-stage="2" className={`form-flow__stage ${step === 2 ? 'is-active' : ''}`}>
              <EventDetailsForm step={2} subtitle="Add the event essentials. RSVP page content only appears when attendance confirmation is selected." showRsvpContent={responsePlan === 'rsvp'} onValidationChange={setDateValid} />
            </div>

            <div data-flow-stage="3" className={`form-flow__stage ${step === 3 ? 'is-active' : ''}`}>
              {responsePlan === 'rsvp' && <div className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--brand-soft)] px-4 py-3 text-xs leading-5 text-[var(--muted)]"><strong className="text-[var(--ink)]">Attendance RSVP selected.</strong> Guest choices enabled below will appear after a guest says they are attending.</div>}
              {responsePlan === 'preferences' && <div className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--brand-soft)] px-4 py-3 text-xs leading-5 text-[var(--muted)]"><strong className="text-[var(--ink)]">Guest choices only selected.</strong> Attendance will not be requested and passes will not be held for confirmation.</div>}
              {responsePlan === 'none' && <div className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-xs leading-5 text-[var(--muted)]">Response-related options are hidden because guests do not need to complete a form.</div>}
              <GuestConfigSection step={3} ticketTypes={ticketTypes} requiredFields={requiredFields} whatsappEnabled={whatsappEnabled} collectAsoEbi={collectAsoEbi} allowPlusOne={allowPlusOne} plusOneLabel={plusOneLabel} asoEbiLabel={asoEbiLabel} asoEbiUnit={asoEbiUnit} preferencesEnabled={responsePlan === 'preferences'} collectCelebrant={collectCelebrant} celebrantOptions={celebrantOptions} whatsappTemplate={whatsappTemplate} templates={waTemplates} lockWhatsApp={responsePlan === 'rsvp'} showPreferencesToggle={false} showGuestPreferenceOptions={responsePlan !== 'none'} onChange={({ ticketTypes: nextTypes, requiredFields: nextFields, whatsappEnabled: nextWhatsapp, collectAsoEbi: nextAsoEbi, allowPlusOne: nextPlusOne, plusOneLabel: nextPlusOneLabel, asoEbiLabel: nextAsoEbiLabel, asoEbiUnit: nextAsoEbiUnit, collectCelebrant: nextCollectCelebrant, celebrantOptions: nextCelebrants, whatsappTemplate: nextTemplate }) => {
                if (nextTypes !== undefined) setTicketTypes(nextTypes)
                if (nextFields !== undefined) setRequiredFields(nextFields)
                if (nextWhatsapp !== undefined && responsePlan !== 'rsvp') setWhatsappEnabled(nextWhatsapp)
                if (nextAsoEbi !== undefined) setCollectAsoEbi(nextAsoEbi)
                if (nextPlusOne !== undefined) setAllowPlusOne(nextPlusOne)
                if (nextPlusOneLabel !== undefined) setPlusOneLabel(nextPlusOneLabel)
                if (nextAsoEbiLabel !== undefined) setAsoEbiLabel(nextAsoEbiLabel)
                if (nextAsoEbiUnit !== undefined) setAsoEbiUnit(nextAsoEbiUnit)
                if (nextCollectCelebrant !== undefined) setCollectCelebrant(nextCollectCelebrant)
                if (nextCelebrants !== undefined) setCelebrantOptions(nextCelebrants)
                if (nextTemplate !== undefined) setWhatsappTemplate(nextTemplate)
              }}/>
            </div>

            <div data-flow-stage="4" className={`form-flow__stage ${step === 4 ? 'is-active' : ''}`}>
              {responsePlan === 'rsvp' ? <div className="form-card"><FormSectionHeader step={4} title="RSVP delivery" description="Attendance confirmation is enabled and WhatsApp delivery is required." /><div className="p-6"><div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4"><p className="text-sm font-semibold text-[var(--ink)]">Next: configure the RSVP invitation</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">After you review and create this event, you will choose the invitation template, send time, response deadline and confirmed-pass timing. Nothing is sent automatically.</p></div></div></div> : whatsappEnabled ? <div className="form-card"><FormSectionHeader step={4} title="Pass delivery" description={responsePlan === 'preferences' ? 'Guest choices are collected separately; passes do not wait for an attendance response.' : 'Choose when registered guests should receive their passes.'} /><div className="p-6"><label className="form-label" htmlFor="pass-timing">When should passes be sent?</label><select id="pass-timing" value={passTiming} onChange={(event) => setPassTiming(event.target.value as 'immediate' | 'scheduled')} className="form-control mt-2"><option value="immediate">Send when each guest is added</option><option value="scheduled">Schedule for later</option></select>{passTiming === 'scheduled' && <div className="mt-4"><label className="form-label" htmlFor="pass-send-at">Delivery date and time</label><div className="mt-2"><DateTimePicker id="pass-send-at" value={passSendAt} onChange={setPassSendAt} required /></div></div>}<p className="form-hint">You can change this later from the event workspace.</p></div></div> : <div className="form-card"><FormSectionHeader step={4} title="Delivery is off" description="WhatsApp delivery is disabled. The event will be created without sending messages or passes." /><div className="p-6 text-sm text-[var(--muted)]">You can enable delivery later from the event workspace.</div></div>}
            </div>

            <div data-flow-stage="5" className={`form-flow__stage ${step === 5 ? 'is-active' : ''}`}>
              <div className="form-card">
                <FormSectionHeader step={5} title="Review before creating" description="Reaching this card does not create anything. Confirm the plan below when you are ready." />
                <div className="p-5 sm:p-6">
                  <div className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4">
                    {[
                      ['Guest response', responsePlanLabel],
                      ['Guest choices', responsePlan === 'none' ? 'Not collected' : enabledChoices.join(', ') || 'No additional choices enabled'],
                      ['WhatsApp', whatsappEnabled ? responsePlan === 'rsvp' ? 'On and required for RSVP' : 'On' : 'Off'],
                      ['Delivery', deliveryLabel],
                      ['After creation', responsePlan === 'rsvp' ? 'Open RSVP management to finish invitation timing' : 'Open the event workspace'],
                    ].map(([label, value]) => <div key={label} className="flex flex-col justify-between gap-1 py-3 text-sm sm:flex-row"><span className="text-[var(--muted)]">{label}</span><span className="font-semibold text-[var(--ink)] sm:max-w-[65%] sm:text-right">{value}</span></div>)}
                  </div>
                  <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]"/><span><span className="block text-sm font-semibold text-[var(--ink)]">I have reviewed this event setup</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">The event will only be created after you tick this box and use the create button below.</span></span></label>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-10 -mx-2 flex gap-3 border-t border-[var(--line)] bg-[var(--bg)]/95 px-2 py-4 backdrop-blur">
              <button type="button" onClick={() => step === 1 ? router.push('/admin/event-management') : setStep((current) => current - 1)} className="flex-1 rounded-full border border-[var(--line)] py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--ink)]">{step === 1 ? 'Cancel' : 'Back'}</button>
              {step < 5 ? <button type="button" onClick={continueSetup} className="flex-1 rounded-full bg-[var(--brand)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]">Continue</button> : <button data-tour="event-submit-button" type="button" onClick={createEvent} disabled={submitting || !reviewConfirmed} className="flex-1 rounded-full bg-[var(--brand)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50">{submitting ? 'Creating…' : responsePlan === 'rsvp' ? 'Create event and continue to RSVP' : 'Create event'}</button>}
            </div>
          </form>
        </div>

        <aside className="admin-editor-aside">
          <div className="admin-editor-guide"><h3>Guided setup</h3><p>The guest-response decision controls which later settings appear.</p><ol>{STEP_LABELS.map((label, index) => <li key={label}><span>{index + 1 < step ? '✓' : index + 1}</span>{label}</li>)}</ol></div>
          <div className="admin-editor-guide"><h3>No surprise creation</h3><p>The event is saved only from the final review card after you explicitly confirm the setup.</p></div>
        </aside>
      </div>
    </div>
  )
}
