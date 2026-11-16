'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { api, Event, RsvpWorkflowStatus, WhatsAppTemplate } from '@/lib/api'
import ZoneSelector, { Zone } from '@/components/ZoneSelector'
import { DateTimePicker } from '@/components/ui/DateTimePicker'
import './rsvp-setup.css'

function toLocalInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function ordinalDate(value: string) {
  const date = new Date(value)
  const day = Number(date.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric' }))
  const suffix = day % 100 >= 11 && day % 100 <= 13
    ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] || 'th'
  const monthAndYear = date.toLocaleDateString('en-GB', {
    timeZone: 'Africa/Lagos',
    month: 'long',
    year: 'numeric',
  })
  return `${day}${suffix} ${monthAndYear}`
}

const fieldClass = 'form-control mt-2'

export default function AddRsvpWorkflowPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [events, setEvents] = useState<Event[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [eventId, setEventId] = useState<number | null>(null)
  const [existingWorkflowId, setExistingWorkflowId] = useState<number | null>(null)
  const [existingWorkflowStatus, setExistingWorkflowStatus] = useState<RsvpWorkflowStatus | null>(null)
  const [invitationTemplate, setInvitationTemplate] = useState<number | null>(null)
  const [passTemplate, setPassTemplate] = useState<number | null>(null)
  const [deadline, setDeadline] = useState('')
  const [invitationTiming, setInvitationTiming] = useState<'immediate' | 'scheduled'>('immediate')
  const [invitationSendAt, setInvitationSendAt] = useState('')
  const [autoSendPass, setAutoSendPass] = useState(true)
  const [passTiming, setPassTiming] = useState<'immediate' | 'scheduled'>('immediate')
  const [passSendAt, setPassSendAt] = useState('')
  const [invitationArtwork, setInvitationArtwork] = useState<File | null>(null)
  const [invitationArtworkUrl, setInvitationArtworkUrl] = useState('')
  const [invitationNameZone, setInvitationNameZone] = useState<Zone | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.getEvents(), api.getWhatsAppTemplates(), api.getRsvpWorkflows()])
      .then(([allEvents, allTemplates, workflows]) => {
        const params = new URLSearchParams(window.location.search)
        const requestedWorkflowId = Number(params.get('workflow')) || null
        const requestedEventId = Number(params.get('event')) || null
        const existing = requestedWorkflowId
          ? workflows.find((workflow) => workflow.id === requestedWorkflowId)
          : workflows.find((workflow) => workflow.event === requestedEventId)
        const effectiveEventId = existing?.event || requestedEventId
        const usedEvents = new Set(workflows.map((workflow) => workflow.event))
        setEvents(allEvents.filter((event) => (
          event.id === effectiveEventId || (
            !event.is_ended
            && new Date(event.date) > new Date()
            && !usedEvents.has(event.id)
          )
        )))
        setTemplates(allTemplates.filter((template) => template.is_active))
        if (effectiveEventId) {
          setEventId(effectiveEventId)
          if (existing) {
            setExistingWorkflowId(existing.id)
            setExistingWorkflowStatus(existing.status)
            setInvitationTemplate(existing.invitation_template)
            setPassTemplate(existing.pass_template)
            setDeadline(existing.response_deadline?.slice(0, 10) || '')
            setInvitationTiming(existing.invitation_send_at ? 'scheduled' : 'immediate')
            setInvitationSendAt(toLocalInput(existing.invitation_send_at))
            setAutoSendPass(existing.auto_send_pass)
            setPassTiming(existing.pass_send_at ? 'scheduled' : 'immediate')
            setPassSendAt(toLocalInput(existing.pass_send_at))
            setInvitationArtworkUrl(existing.invitation_design || '')
            if ([existing.invitation_name_zone_x, existing.invitation_name_zone_y, existing.invitation_name_zone_w, existing.invitation_name_zone_h].every((value) => value !== null)) {
              setInvitationNameZone({
                x: existing.invitation_name_zone_x!,
                y: existing.invitation_name_zone_y!,
                w: existing.invitation_name_zone_w!,
                h: existing.invitation_name_zone_h!,
              })
            }
          }
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load setup data.'))
      .finally(() => setLoading(false))
  }, [])

  const selectedEvent = events.find((event) => event.id === eventId)
  const selectedInvitation = templates.find((template) => template.id === invitationTemplate)
  const selectedPass = templates.find((template) => template.id === passTemplate)
  const passDefaultLabel = selectedEvent?.whatsapp_template_name
    ? `Event default (${selectedEvent.whatsapp_template_name})`
    : 'Global default template'
  const invitationOptions = templates.filter((template) => template.body_params.includes('rsvp_link'))
  const passOptions = templates.filter((template) => (
    template.has_header_image && !template.body_params.includes('rsvp_link')
  ))
  const hasInvitationArtwork = Boolean(invitationArtwork || invitationArtworkUrl)

  function chooseInvitationArtwork(file: File | null) {
    setError('')
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Upload the RSVP artwork as a PNG or JPEG image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('The RSVP artwork must be 5 MB or smaller.')
      return
    }
    if (invitationArtworkUrl.startsWith('blob:')) URL.revokeObjectURL(invitationArtworkUrl)
    setInvitationArtwork(file)
    setInvitationArtworkUrl(URL.createObjectURL(file))
    setInvitationNameZone(null)
  }

  const preview = useMemo(() => {
    if (!selectedInvitation) return 'Select an RSVP template to preview its message.'
    const samples: Record<string, string> = {
      guest_name: 'Aisha Bello',
      event_name: selectedEvent?.name || 'Your Event',
      event_date: selectedEvent
        ? new Date(selectedEvent.date).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
        : '24 October 2026',
      event_date_only: selectedEvent
        ? ordinalDate(selectedEvent.date)
        : '16th September 2026',
      event_time: selectedEvent
        ? new Date(selectedEvent.date).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
        : '1:00 PM',
      venue: selectedEvent?.venue || 'Event venue',
      ticket_type: 'General',
      table_number: '12',
      seat_number: '4',
      rsvp_link: 'https://guestpass.example/your-event/rsvp/aisha-bello-A7kP4m',
      rsvp_deadline: deadline
        ? ordinalDate(`${deadline}T12:00:00+01:00`)
        : '9th September 2026',
    }
    let text = selectedInvitation.body_text
    selectedInvitation.body_params.forEach((key, index) => {
      text = text.replaceAll(`{{${index + 1}}}`, samples[key] ?? key)
    })
    return text || selectedInvitation.description || 'Template body preview is unavailable.'
  }, [deadline, selectedEvent, selectedInvitation])

  function continueSetup() {
    setError('')
    if (step === 1 && !eventId) return setError('Select an event to continue.')
    if (step === 2 && !invitationTemplate) {
      return setError('Select an RSVP invitation template.')
    }
    if (step === 2 && selectedInvitation?.body_params.includes('rsvp_deadline') && !deadline) {
      return setError('Set a response deadline because this WhatsApp template includes the RSVP deadline.')
    }
    if (step === 2 && hasInvitationArtwork && !selectedInvitation?.has_header_image) {
      return setError('Choose an RSVP template with an image header to attach this artwork.')
    }
    if (step === 2 && selectedInvitation?.has_header_image && !hasInvitationArtwork) {
      return setError('Attach RSVP artwork for the selected image-header template.')
    }
    if (step === 2 && hasInvitationArtwork && !invitationNameZone) {
      return setError('Drag over the guest-name area on the RSVP artwork.')
    }
    if (step === 2 && invitationTiming === 'scheduled' && !invitationSendAt) {
      return setError('Choose a date and time for scheduled RSVP invitations.')
    }
    if (step === 2 && autoSendPass && passTiming === 'scheduled' && !passSendAt) {
      return setError('Choose a date and time for scheduled guest-pass delivery.')
    }
    if (step === 2 && autoSendPass && !selectedEvent?.design_template) {
      return setError('Upload a guest-pass design for this event before enabling automatic pass delivery.')
    }
    setStep((current) => Math.min(3, current + 1))
  }

  async function saveWorkflow(event: FormEvent) {
    event.preventDefault()
    if (!eventId || !invitationTemplate) return
    if (invitationTiming === 'scheduled' && !invitationSendAt) {
      setError('Choose a date and time for scheduled RSVP invitations.'); return
    }
    if (autoSendPass && passTiming === 'scheduled' && !passSendAt) {
      setError('Choose a date and time for scheduled guest-pass delivery.'); return
    }
    setSaving(true)
    setError('')
    try {
      const payload = new FormData()
      payload.append('event', String(eventId))
      payload.append('invitation_template', String(invitationTemplate))
      payload.append('pass_template', passTemplate ? String(passTemplate) : '')
      payload.append('response_deadline', deadline ? new Date(`${deadline}T23:59:00`).toISOString() : '')
      payload.append('invitation_send_at', invitationTiming === 'scheduled' && invitationSendAt ? new Date(invitationSendAt).toISOString() : '')
      payload.append('auto_send_pass', String(autoSendPass))
      payload.append('pass_send_at', autoSendPass && passTiming === 'scheduled' && passSendAt ? new Date(passSendAt).toISOString() : '')
      if (invitationArtwork) payload.append('invitation_design', invitationArtwork)
      if (invitationNameZone) {
        payload.append('invitation_name_zone_x', String(invitationNameZone.x))
        payload.append('invitation_name_zone_y', String(invitationNameZone.y))
        payload.append('invitation_name_zone_w', String(invitationNameZone.w))
        payload.append('invitation_name_zone_h', String(invitationNameZone.h))
      }
      const workflow = existingWorkflowId
        ? await api.updateRsvpWorkflow(existingWorkflowId, payload)
        : await api.createRsvpWorkflow(payload)
      if (!existingWorkflowId || existingWorkflowStatus === 'draft') {
        await api.populateRsvpRecipients(workflow.id)
      }
      router.push(`/admin/rsvp-management/${workflow.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the workflow.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="px-6 py-14 text-sm" style={{ color: 'var(--muted)' }}>Loading setup…</div>
  }

  const reviewRows = [
    ['Event', selectedEvent?.name],
    ['Eligible guests', selectedEvent ? `${selectedEvent.guest_count} registered (guests without phone numbers will be excluded)` : '—'],
    ['Invitation template', selectedInvitation?.display_name || selectedInvitation?.name],
    ['RSVP artwork', hasInvitationArtwork ? 'Attached with personalised guest name' : 'No artwork — message only'],
    ['Invitation delivery', invitationTiming === 'scheduled' && invitationSendAt ? new Date(invitationSendAt).toLocaleString('en-GB') : 'Immediately when workflow is launched'],
    ['Pass template', autoSendPass ? selectedPass?.display_name || selectedPass?.name || passDefaultLabel : 'Manual delivery'],
    ['Pass delivery', !autoSendPass ? 'Manual delivery' : passTiming === 'scheduled' && passSendAt ? new Date(passSendAt).toLocaleString('en-GB') : 'Immediately after each confirmation'],
    ['Response deadline', deadline ? new Date(`${deadline}T12:00:00`).toLocaleDateString('en-GB', { dateStyle: 'long' }) : 'No deadline'],
  ]

  return <form onSubmit={saveWorkflow} className="rsvp-setup admin-page">
    <div className="rsvp-setup__hero">
      <button type="button" onClick={() => router.push('/admin/rsvp-management')} className="rsvp-setup__back">← RSVP management</button>
      <div className="rsvp-setup__hero-row">
        <div><p className="rsvp-setup__eyebrow">Attendance workflow</p><h1>{existingWorkflowId ? 'Edit RSVP setup' : 'Create RSVP setup'}</h1><p>Prepare the invitation, response window and confirmed-pass delivery before anything is sent.</p></div>
        {selectedEvent && <div className="rsvp-setup__event-chip"><span>Selected event</span><strong>{selectedEvent.name}</strong><small>{new Date(selectedEvent.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</small></div>}
      </div>
      <div className="rsvp-setup__steps">
        {['Choose event', 'Invitation & timing', 'Review'].map((label, index) => { const number = index + 1; return <button type="button" key={label} onClick={() => number < step && setStep(number)} className={number === step ? 'is-active' : number < step ? 'is-complete' : ''}><span>{number < step ? '✓' : number}</span><b>{label}</b><i /></button> })}
      </div>
    </div>

    {error && <div role="alert" className="rsvp-setup__error">{error}</div>}

    {step === 1 && <section className="rsvp-setup__panel">
      <div className="rsvp-setup__section-heading"><span>01</span><div><h2>Which event needs RSVP?</h2><p>Only upcoming events without another RSVP workflow are available.</p></div></div>
      {events.length ? <div className="rsvp-event-grid">{events.map((item) => <button type="button" key={item.id} disabled={!!existingWorkflowId && item.id !== eventId} onClick={() => setEventId(item.id)} className={eventId === item.id ? 'is-selected' : ''}><span className="rsvp-event-grid__date"><b>{new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit' })}</b><small>{new Date(item.date).toLocaleDateString('en-GB', { month: 'short' })}</small></span><span><strong>{item.name}</strong><small>{item.venue || 'Venue not added'} · {item.guest_count} guests</small></span><i>{eventId === item.id ? '✓' : '→'}</i></button>)}</div> : <div className="rsvp-setup__empty"><strong>No eligible events</strong><p>Create an upcoming event or remove its existing RSVP workflow first.</p></div>}
    </section>}

    {step === 2 && <div className="rsvp-setup__workspace">
      <div className="rsvp-setup__main">
        <section className="rsvp-setup__panel">
          <div className="rsvp-setup__section-heading"><span>01</span><div><h2>Guest invitation</h2><p>Choose the approved WhatsApp message and when it should go out.</p></div></div>
          <div className="rsvp-setup__fields">
            <div className="rsvp-setup__field rsvp-setup__field--wide"><label htmlFor="rsvp-invitation-template">RSVP invitation template <em>Required</em></label><select id="rsvp-invitation-template" value={invitationTemplate ?? ''} onChange={(e) => setInvitationTemplate(e.target.value ? Number(e.target.value) : null)} className={fieldClass}><option value="">Select an approved template</option>{invitationOptions.map((template) => <option key={template.id} value={template.id}>{template.display_name || template.name}{template.has_header_image ? ' — includes image' : ' — message only'}</option>)}</select>{invitationOptions.length === 0 && <p className="is-warning">Create an active template containing the rsvp_link variable first.</p>}</div>
            <div className="rsvp-setup__field"><label htmlFor="rsvp-invitation-timing">Send invitations</label><select id="rsvp-invitation-timing" value={invitationTiming} onChange={(e) => setInvitationTiming(e.target.value as 'immediate' | 'scheduled')} className={fieldClass}><option value="immediate">Immediately when launched</option><option value="scheduled">Schedule for later</option></select>{invitationTiming === 'scheduled' && <div className="mt-3"><DateTimePicker id="rsvp-invitation-send-at" aria-label="Invitation delivery date and time" value={invitationSendAt} onChange={setInvitationSendAt} required /></div>}</div>
            <div className="rsvp-setup__field"><label htmlFor="rsvp-response-deadline">Response deadline <em>Recommended</em></label><input type="date" id="rsvp-response-deadline" value={deadline} max={selectedEvent?.date.slice(0, 10)} onChange={(e) => setDeadline(e.target.value)} className={fieldClass}/><p>Guests can respond until 11:59 PM on this date.</p></div>
          </div>
        </section>

        <section className="rsvp-setup__panel">
          <div className="rsvp-setup__section-heading"><span>02</span><div><h2>Invitation artwork <small>Optional</small></h2><p>Personalise an image with each guest’s name before attaching it.</p></div><label className="rsvp-setup__upload">{hasInvitationArtwork ? 'Replace artwork' : 'Upload artwork'}<input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(event) => chooseInvitationArtwork(event.target.files?.[0] || null)} /></label></div>
          {!invitationArtworkUrl ? <div className="rsvp-setup__artwork-empty"><span>PNG or JPEG</span><strong>Add invitation artwork when your WhatsApp template has an image header</strong><small>Maximum file size: 5 MB</small></div> : <div className="rsvp-setup__artwork-editor"><div><strong>Place the guest name</strong><p>Drag over the exact area where the personalised name should appear.</p></div><div className="mx-auto max-w-lg"><ZoneSelector imageUrl={invitationArtworkUrl} zone={invitationNameZone} onChange={setInvitationNameZone} label="Guest name" color="amber" borderColor="#d4af37" bgColor="rgba(212,175,55,0.18)" dotColor="#d4af37" /></div><p className={selectedInvitation?.has_header_image ? 'is-ready' : 'is-warning'}>{selectedInvitation?.has_header_image ? '✓ Artwork is compatible with the selected template.' : 'Choose an RSVP template that includes an image header.'}</p></div>}
        </section>

        <section className="rsvp-setup__panel">
          <div className="rsvp-setup__section-heading"><span>03</span><div><h2>After a guest confirms</h2><p>Choose whether Event Pro should release and deliver their pass.</p></div><button type="button" role="switch" aria-label="Automatically deliver passes after confirmation" aria-checked={autoSendPass} onClick={() => setAutoSendPass(!autoSendPass)} className={`rsvp-setup__switch ${autoSendPass ? 'is-on' : ''}`}><i /></button></div>
          {autoSendPass ? <div className="rsvp-setup__fields"><div className="rsvp-setup__field"><label htmlFor="rsvp-pass-template">Confirmed-pass template</label><select id="rsvp-pass-template" value={passTemplate ?? ''} onChange={(e) => setPassTemplate(e.target.value ? Number(e.target.value) : null)} className={fieldClass}><option value="">{passDefaultLabel}</option>{passOptions.map((template) => <option key={template.id} value={template.id}>{template.display_name || template.name}</option>)}</select><p>Only image-header pass templates are available.</p></div><div className="rsvp-setup__field"><label htmlFor="rsvp-pass-timing">Send confirmed passes</label><select id="rsvp-pass-timing" value={passTiming} onChange={(e) => setPassTiming(e.target.value as 'immediate' | 'scheduled')} className={fieldClass}><option value="immediate">Immediately after confirmation</option><option value="scheduled">At a scheduled time</option></select>{passTiming === 'scheduled' && <div className="mt-3"><DateTimePicker id="rsvp-pass-send-at" aria-label="Confirmed pass delivery date and time" value={passSendAt} onChange={setPassSendAt} required /></div>}</div></div> : <div className="rsvp-setup__manual-note"><strong>Manual pass delivery</strong><p>Guests can still confirm attendance, but your team will decide when to send each pass.</p></div>}
        </section>
      </div>

      <aside className="rsvp-setup__aside">
        <div className="rsvp-preview"><div className="rsvp-preview__top"><span>WhatsApp preview</span><i>● ● ●</i></div><div className="rsvp-preview__body"><div className="rsvp-preview__bubble"><strong>{selectedInvitation?.display_name || selectedInvitation?.name || 'Invitation message'}</strong><p>{preview}</p><small>12:30 PM ✓✓</small></div></div><div className="rsvp-preview__secure">🔒 Every guest receives a unique six-character RSVP link.</div></div>
        <div className="rsvp-setup__checklist"><h3>Ready to continue?</h3>{[['Invitation template', !!invitationTemplate], ['Response window', !!deadline], ['Artwork placement', !hasInvitationArtwork || !!invitationNameZone], ['Confirmed-pass plan', !autoSendPass || !!selectedEvent?.design_template]].map(([label, ready]) => <div key={String(label)} className={ready ? 'is-ready' : ''}><span>{ready ? '✓' : '○'}</span>{label}</div>)}</div>
      </aside>
    </div>}

    {step === 3 && <section className="rsvp-setup__panel rsvp-setup__review">
      <div className="rsvp-setup__section-heading"><span>03</span><div><h2>Review the complete workflow</h2><p>Saving creates the setup only. No invitation is sent until you launch it.</p></div></div>
      <div className="rsvp-review-grid">{reviewRows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || '—'}</strong></div>)}</div>
      <div className="rsvp-setup__launch-note"><span>✓</span><div><strong>Safe to save</strong><p>You can review recipients and make changes before launching this RSVP workflow.</p></div></div>
    </section>}

    <div className="rsvp-setup__footer"><button type="button" onClick={() => step === 1 ? router.push('/admin/rsvp-management') : setStep(step - 1)} className="admin-secondary-action">{step === 1 ? 'Cancel' : '← Back'}</button><span>Step {step} of 3</span>{step < 3 ? <button type="button" onClick={continueSetup} className="admin-primary-action">Continue →</button> : <button type="submit" disabled={saving} className="admin-primary-action disabled:opacity-50">{saving ? 'Saving…' : existingWorkflowId ? 'Save RSVP setup' : 'Create RSVP setup'}</button>}</div>
  </form>
}
