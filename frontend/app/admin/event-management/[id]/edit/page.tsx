'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { api, Event, Font, WhatsAppTemplate } from '@/lib/api'
import { toWatDateTimeInput, watDateTimeInputToIso } from '@/lib/datetime'
import type { TicketTypeDef } from '@/components/EventConfigPanel'
import NameTypographyPanel from '@/components/NameTypographyPanel'
import type { Zone } from '@/components/PassDesignPanel'
import { EventDetailsForm } from '@/components/events/EventDetailsForm'
import { PassDesignSection } from '@/components/events/PassDesignSection'
import { GuestConfigSection } from '@/components/events/GuestConfigSection'
import { RequirementBuilder } from '@/components/events/RequirementBuilder'
import { FormSectionHeader } from '@/components/ui/FormSectionHeader'
import { DateTimePicker } from '@/components/ui/DateTimePicker'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

import { ensureCsrfToken } from '@/lib/api/request'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorFormRef = useRef<HTMLFormElement>(null)
  const [editStep, setEditStep] = useState(1)
  const [event, setEvent]     = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]     = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [newFileChosen, setNewFileChosen] = useState(false)
  const [qrZone, setQrZone]   = useState<Zone | null>(null)
  const [qrTouched, setQrTouched] = useState(false)
  const [nameZone, setNameZone] = useState<Zone | null>(null)
  const [nameTouched, setNameTouched] = useState(false)
  const [fonts, setFonts]     = useState<Font[]>([])
  const [selectedFont, setSelectedFont] = useState('')
  const [fontColor, setFontColor] = useState('#ffffff')
  const [fontSizeFrac, setFontSizeFrac] = useState(0.05)
  const [qrBgColor, setQrBgColor] = useState('none')
  const [ticketTypes, setTicketTypes] = useState<TicketTypeDef[]>([])
  const [requiredFields, setRequiredFields] = useState<string[]>(['phone_number'])
  const [whatsappEnabled, setWhatsappEnabled] = useState(true)
  const [rsvpEnabled, setRsvpEnabled] = useState(false)
  const [collectAsoEbi, setCollectAsoEbi] = useState(false)
  const [allowPlusOne, setAllowPlusOne] = useState(false)
  const [plusOneLabel, setPlusOneLabel] = useState('')
  const [asoEbiLabel, setAsoEbiLabel] = useState('')
  const [asoEbiUnit, setAsoEbiUnit] = useState('')
  const [preferencesEnabled, setPreferencesEnabled] = useState(false)
  const [preferencesDeadline, setPreferencesDeadline] = useState('')
  const [collectCelebrant, setCollectCelebrant] = useState(false)
  const [celebrantOptions, setCelebrantOptions] = useState<string[]>([])
  const [whatsappTemplate, setWhatsappTemplate] = useState<number | null>(null)
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>([])
  const [dateValid, setDateValid] = useState(true)
  const [passTiming, setPassTiming] = useState<'immediate' | 'scheduled'>('immediate')
  const [passSendAt, setPassSendAt] = useState('')

  useEffect(() => {
    Promise.all([api.getEvent(Number(id)), api.getFonts(), api.getWhatsAppTemplates()])
      .then(([ev, fts, wats]) => {
        setEvent(ev); setFonts(fts); setWaTemplates(wats)
        if (ev.qr_zone_x != null && ev.qr_zone_y != null && ev.qr_zone_w != null && ev.qr_zone_h != null)
          setQrZone({ x: ev.qr_zone_x, y: ev.qr_zone_y, w: ev.qr_zone_w, h: ev.qr_zone_h })
        if (ev.name_zone_x != null && ev.name_zone_y != null && ev.name_zone_w != null && ev.name_zone_h != null)
          setNameZone({ x: ev.name_zone_x, y: ev.name_zone_y, w: ev.name_zone_w, h: ev.name_zone_h })
        if (ev.design_template) setPreviewUrl(ev.design_template)
        if (ev.name_font) setSelectedFont(String(ev.name_font))
        setFontColor(ev.name_font_color || '#ffffff'); setFontSizeFrac(ev.name_font_size_fraction ?? 0.05)
        setQrBgColor(ev.qr_bg_color || 'none')
        if (ev.ticket_types?.length) setTicketTypes(ev.ticket_types as TicketTypeDef[])
        if (ev.required_fields?.length) setRequiredFields(ev.required_fields as string[])
        setWhatsappEnabled(ev.whatsapp_enabled ?? true)
        setRsvpEnabled(ev.rsvp_enabled ?? Boolean(ev.rsvp_workflow_id))
        setCollectAsoEbi(ev.collect_aso_ebi ?? false)
        setAllowPlusOne(ev.allow_plus_one ?? false)
        setPlusOneLabel(ev.plus_one_label ?? '')
        setAsoEbiLabel(ev.aso_ebi_label ?? '')
        setAsoEbiUnit(ev.aso_ebi_unit ?? '')
        setPreferencesEnabled(ev.preferences_enabled ?? false)
        setPreferencesDeadline(ev.preferences_deadline ? toWatDateTimeInput(ev.preferences_deadline) : '')
        setCollectCelebrant(ev.collect_celebrant ?? false)
        setCelebrantOptions(ev.celebrant_options ?? [])
        setWhatsappTemplate(ev.whatsapp_template ?? null)
        if (ev.pass_send_at) {
          setPassTiming('scheduled')
          const sendDate = new Date(ev.pass_send_at)
          const offset = sendDate.getTimezoneOffset() * 60_000
          setPassSendAt(new Date(sendDate.getTime() - offset).toISOString().slice(0, 16))
        }
      })
      .catch(() => setError('Could not load event.')).finally(() => setLoading(false))
  }, [id])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Only PNG and JPG files are supported.'); e.target.value = ''; return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.'); e.target.value = ''; return
    }
    setError(''); setNewFileChosen(true); setQrZone(null); setQrTouched(false); setNameZone(null); setNameTouched(false)
    setPreviewUrl(URL.createObjectURL(file))
  }

  function continueEditor() {
    setError('')
    if (editStep === 1 && !dateValid) { setError('Please set a future date and time for the event.'); return }
    const stage = editorFormRef.current?.querySelector(`[data-flow-stage="${editStep}"]`)
    const invalid = stage?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(':invalid')
    if (invalid) { invalid.reportValidity(); return }
    setEditStep((current) => Math.min(5, current + 1))
  }

  /** Never let a field submit or advance the whole editor implicitly.
   *  Child controls such as "add ticket category" handle Enter themselves;
   *  navigation and saving remain explicit button actions. */
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter' || e.defaultPrevented) return
    const target = e.target as HTMLElement
    if (target instanceof HTMLTextAreaElement) return
    if (target instanceof HTMLButtonElement) return
    e.preventDefault()
  }

  async function saveChanges() {
    const form = editorFormRef.current
    if (!form) return
    if (!dateValid) { setError('Please set a future date and time for the event.'); return }
    if (!rsvpEnabled && whatsappEnabled && passTiming === 'scheduled' && !passSendAt) {
      setError('Choose a date and time for scheduled guest-pass delivery.'); return
    }
    if (preferencesEnabled && !rsvpEnabled && !preferencesDeadline) {
      setError('Set a deadline for standalone preference submissions.'); setEditStep(2); return
    }
    setError(''); setSubmitting(true)
    const fd = new FormData()
    fd.append('name', (form.elements.namedItem('name') as HTMLInputElement).value)
    fd.append('date', watDateTimeInputToIso((form.elements.namedItem('date') as HTMLInputElement).value))
    fd.append('venue', (form.elements.namedItem('venue') as HTMLInputElement).value)
    fd.append('description', (form.elements.namedItem('description') as HTMLTextAreaElement).value)
    fd.append('rsvp_message', (form.elements.namedItem('rsvp_message') as HTMLTextAreaElement).value)
    fd.append('color_of_day', (form.elements.namedItem('color_of_day') as HTMLInputElement).value)
    for (const colourField of ['rsvp_primary_color', 'rsvp_background_color', 'rsvp_card_color', 'rsvp_text_color']) {
      fd.append(colourField, (form.elements.namedItem(colourField) as HTMLInputElement).value)
    }
    const rsvpBackground = (form.elements.namedItem('rsvp_background_image') as HTMLInputElement).files?.[0]
    const clearRsvpBackground = (form.elements.namedItem('clear_rsvp_background_image') as HTMLInputElement | null)?.checked
    if (rsvpBackground) fd.append('rsvp_background_image', rsvpBackground)
    else if (clearRsvpBackground) fd.append('rsvp_background_image', '')
    if (fileInputRef.current?.files?.[0]) fd.append('design_template', fileInputRef.current.files[0])
    if (qrTouched) { if (qrZone) { fd.append('qr_zone_x', String(qrZone.x)); fd.append('qr_zone_y', String(qrZone.y)); fd.append('qr_zone_w', String(qrZone.w)); fd.append('qr_zone_h', String(qrZone.h)) } else { fd.append('qr_zone_x', ''); fd.append('qr_zone_y', ''); fd.append('qr_zone_w', ''); fd.append('qr_zone_h', '') } }
    if (nameTouched) { if (nameZone) { fd.append('name_zone_x', String(nameZone.x)); fd.append('name_zone_y', String(nameZone.y)); fd.append('name_zone_w', String(nameZone.w)); fd.append('name_zone_h', String(nameZone.h)) } else { fd.append('name_zone_x', ''); fd.append('name_zone_y', ''); fd.append('name_zone_w', ''); fd.append('name_zone_h', '') } }
    fd.append('name_font', selectedFont); fd.append('name_font_color', fontColor); fd.append('name_font_size_fraction', String(fontSizeFrac))
    fd.append('qr_bg_color', qrBgColor); fd.append('ticket_types', JSON.stringify(ticketTypes)); fd.append('required_fields', JSON.stringify(requiredFields)); fd.append('whatsapp_enabled', String(whatsappEnabled)); fd.append('collect_aso_ebi', String(collectAsoEbi)); fd.append('allow_plus_one', String(allowPlusOne)); fd.append('plus_one_label', plusOneLabel.trim()); fd.append('aso_ebi_label', asoEbiLabel.trim()); fd.append('aso_ebi_unit', asoEbiUnit.trim()); fd.append('preferences_enabled', String(preferencesEnabled && !rsvpEnabled)); fd.append('preferences_deadline', preferencesEnabled && !rsvpEnabled && preferencesDeadline ? watDateTimeInputToIso(preferencesDeadline) : ''); fd.append('collect_celebrant', String(collectCelebrant)); fd.append('celebrant_options', JSON.stringify(celebrantOptions))
    fd.append('rsvp_enabled', String(rsvpEnabled))
    fd.append('whatsapp_template', whatsappTemplate ? String(whatsappTemplate) : '')
    if (!rsvpEnabled) fd.append('pass_send_at', passTiming === 'scheduled' && passSendAt ? new Date(passSendAt).toISOString() : '')
    try {
      const csrf = await ensureCsrfToken()
      const res = await fetch(`${BASE_URL}/events/${id}/`, { method: 'PATCH', body: fd, credentials: 'include', headers: { 'X-CSRFToken': csrf } })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail ?? JSON.stringify(err)) }
      router.push(`/admin/event-management/${id}`)
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to save changes.'); setSubmitting(false) }
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-sm text-[var(--muted)]">Loading event…</p></div>
  if (!event) return <div className="px-6 py-8 lg:px-8 lg:py-10"><p className="text-sm" style={{ color: 'var(--danger)' }}>{error || 'Event not found.'}</p></div>

  return (
    <div className="admin-page admin-page--editor">
      <AdminPageHeader eyebrow="Event editor" title={event.name} description="Update guest rules, messaging, artwork and pass layout from a single editor." actions={<button type="button" onClick={() => router.push(`/admin/event-management/${id}`)} className="admin-secondary-action">← Event workspace</button>} />
      {error && <div className="mb-5 rounded-[14px] px-5 py-3.5 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)' }}>{error}</div>}
      <div className="admin-editor-grid"><div className="admin-editor-main"><form ref={editorFormRef} onSubmit={(event) => event.preventDefault()} onKeyDown={handleFormKeyDown} className="form-card form-flow">
        <div className="form-flow__topline"><div><p>Event editor</p><h2>{['Event details','Guest rules','Delivery','Pass artwork','Name styling'][editStep - 1]}</h2></div><strong>{editStep}<span>/05</span></strong></div>
        <div className="form-flow__progress"><i style={{ width: `${editStep * 20}%` }}/></div>
        <div className="form-flow__steps" style={{ gridTemplateColumns: 'repeat(5,minmax(0,1fr))' }}>{['Details','Guests','Delivery','Artwork','Type'].map((label,index) => <button type="button" key={label} onClick={() => index + 1 < editStep && setEditStep(index + 1)} className={index + 1 === editStep ? 'is-active' : index + 1 < editStep ? 'is-complete' : ''}><span>{index + 1 < editStep ? '✓' : index + 1}</span>{label}</button>)}</div>
        <div data-flow-stage="1" className={`form-flow__stage p-4 ${editStep === 1 ? 'is-active' : ''}`}><EventDetailsForm step={1} event={event} onValidationChange={setDateValid} /></div>
        <div data-flow-stage="2" className={`form-flow__stage p-4 ${editStep === 2 ? 'is-active' : ''}`}><GuestConfigSection step={2} ticketTypes={ticketTypes} requiredFields={requiredFields}
          whatsappEnabled={whatsappEnabled} collectAsoEbi={collectAsoEbi} allowPlusOne={allowPlusOne} plusOneLabel={plusOneLabel} asoEbiLabel={asoEbiLabel} asoEbiUnit={asoEbiUnit} preferencesEnabled={preferencesEnabled} collectCelebrant={collectCelebrant} celebrantOptions={celebrantOptions} whatsappTemplate={whatsappTemplate} templates={waTemplates} showPreferencesToggle={!rsvpEnabled} showGuestPreferenceOptions={rsvpEnabled || preferencesEnabled}
          onChange={({ ticketTypes: tt, requiredFields: rf, whatsappEnabled: wa, collectAsoEbi: ae, allowPlusOne: po, plusOneLabel: pol, asoEbiLabel: ael, asoEbiUnit: aeu, preferencesEnabled: pe, collectCelebrant: cc, celebrantOptions: co, whatsappTemplate: wt }) => {
            if (tt !== undefined) setTicketTypes(tt)
            if (rf !== undefined) setRequiredFields(rf)
            if (wa !== undefined) setWhatsappEnabled(wa)
            if (ae !== undefined) setCollectAsoEbi(ae)
            if (po !== undefined) setAllowPlusOne(po)
            if (pol !== undefined) setPlusOneLabel(pol)
            if (ael !== undefined) setAsoEbiLabel(ael)
            if (aeu !== undefined) setAsoEbiUnit(aeu)
            if (pe !== undefined) setPreferencesEnabled(pe)
            if (cc !== undefined) setCollectCelebrant(cc)
            if (co !== undefined) setCelebrantOptions(co)
            if (wt !== undefined) setWhatsappTemplate(wt)
          }} />
          {preferencesEnabled && !rsvpEnabled && <div className="form-card mt-4"><FormSectionHeader title="Preferences deadline" description="The standalone form closes automatically at this date and time." /><div className="p-5 sm:p-6"><label className="form-label" htmlFor="preferences-deadline">Last time guests can submit</label><div className="mt-2"><DateTimePicker id="preferences-deadline" value={preferencesDeadline} onChange={setPreferencesDeadline} required /></div><p className="form-hint">Choose a time before the event, leaving enough time to send final totals to caterers and vendors.</p></div></div>}
          {(rsvpEnabled || preferencesEnabled) ? <div className="mt-4"><RequirementBuilder eventId={Number(id)} collectionChannel={rsvpEnabled ? 'rsvp' : 'preferences'} /></div> : <div className="mt-4 rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg)] px-5 py-4"><p className="text-sm font-semibold text-[var(--ink)]">Preference questions are unavailable</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Enable the standalone preferences form above, or enable RSVP in Delivery, before configuring meal, dietary, shuttle or other guest questions.</p></div>}
        </div>
        <div data-flow-stage="3" className={`form-flow__stage p-4 ${editStep === 3 ? 'is-active' : ''}`}>
        {whatsappEnabled && !event.rsvp_workflow_id && <div className="form-card">
          <FormSectionHeader step={3} title="Delivery flow" description="Choose whether guests must confirm before receiving a pass." />
          <div className="p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`form-choice ${rsvpEnabled ? 'form-choice--selected' : ''}`}><span className="flex items-start gap-3"><input type="radio" name="edit_delivery_flow" checked={rsvpEnabled} onChange={() => setRsvpEnabled(true)} className="mt-1 accent-[var(--brand)]"/><span><span className="block text-sm font-semibold text-[var(--ink)]">Confirm RSVP first</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">Hold every guest pass until the guest confirms.</span></span></span></label>
              <label className={`form-choice ${!rsvpEnabled ? 'form-choice--selected' : ''}`}><span className="flex items-start gap-3"><input type="radio" name="edit_delivery_flow" checked={!rsvpEnabled} onChange={() => setRsvpEnabled(false)} className="mt-1 accent-[var(--brand)]"/><span><span className="block text-sm font-semibold text-[var(--ink)]">Send passes directly</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">Skip RSVP confirmation for new guest passes.</span></span></span></label>
            </div>
            {rsvpEnabled ? <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4"><p className="text-sm font-semibold text-[var(--ink)]">Guest passes are currently held</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">This event still requires RSVP even though its previous setup was deleted. Save your changes, then create a replacement setup.</p><a href={`/admin/rsvp-management/add?event=${event.id}`} className="mt-3 inline-block text-xs font-semibold text-[var(--brand)]">Open RSVP management &rarr;</a></div> : <div className="mt-5 border-t border-[var(--line)] pt-5"><label className="form-label" htmlFor="edit-pass-timing">Default delivery timing for new guests</label><select id="edit-pass-timing" value={passTiming} onChange={(e) => setPassTiming(e.target.value as 'immediate' | 'scheduled')} className="form-control mt-2"><option value="immediate">Send immediately</option><option value="scheduled">Schedule for later</option></select>{passTiming === 'scheduled' && <div className="mt-3"><label className="form-label" htmlFor="edit-pass-send-at">Delivery date and time</label><div className="mt-2"><DateTimePicker id="edit-pass-send-at" value={passSendAt} onChange={setPassSendAt} required /></div></div>}<p className="form-hint">Immediate delivery sends the pass when a guest is added. Scheduled delivery applies the selected time to new guests.</p></div>}
          </div>
        </div>}
        {whatsappEnabled && event.rsvp_workflow_id && <div className="form-card"><FormSectionHeader step={3} title="RSVP delivery" description="Invitation and confirmed-pass timing are managed in RSVP management." /><div className="p-6"><button type="button" onClick={() => router.push(`/admin/rsvp-management/${event.rsvp_workflow_id}`)} className="text-sm font-semibold text-[var(--brand)]">Open RSVP management &rarr;</button></div></div>}
        {!whatsappEnabled && <div className="form-card"><FormSectionHeader step={3} title="Delivery flow" description="WhatsApp delivery is off. Enable it above whenever you are ready to send passes." /></div>}
        </div>
        <div data-flow-stage="4" className={`form-flow__stage p-4 ${editStep === 4 ? 'is-active' : ''}`}><PassDesignSection step={4} event={event} newFileChosen={newFileChosen} fileInputRef={fileInputRef}
          previewUrl={previewUrl} qrZone={qrZone} nameZone={nameZone} qrBgColor={qrBgColor}
          fontColor={fontColor} fontSizeFrac={fontSizeFrac}
          fontName={fonts.find((f) => String(f.id) === selectedFont)?.name ?? ''}
          fontFileUrl={fonts.find((f) => String(f.id) === selectedFont)?.file}
          onFileChange={handleFileChange} onQrChange={(z) => { setQrZone(z); setQrTouched(true) }}
          onNameChange={(z) => { setNameZone(z); setNameTouched(true) }} onQrBgColorChange={setQrBgColor} isEdit /></div>
        <div data-flow-stage="5" className={`form-flow__stage p-4 ${editStep === 5 ? 'is-active' : ''}`}><NameTypographyPanel step={5} fonts={fonts} selectedFont={selectedFont} fontColor={fontColor} fontSizeFrac={fontSizeFrac}
          onFontChange={setSelectedFont} onColorChange={setFontColor} onSizeChange={setFontSizeFrac} /></div>
        <div className="form-flow__footer"><button type="button" onClick={() => editStep === 1 ? router.push(`/admin/event-management/${id}`) : setEditStep((current) => current - 1)} className="admin-secondary-action">{editStep === 1 ? 'Cancel' : '← Back'}</button>{editStep < 5 ? <button type="button" onClick={continueEditor} className="admin-primary-action">Continue →</button> : <button type="button" onClick={saveChanges} disabled={submitting} className="admin-primary-action disabled:opacity-60">{submitting ? 'Saving…' : 'Save changes'}</button>}</div>
      </form></div><aside className="admin-editor-aside"><div className="admin-editor-guide"><h3>Event configuration</h3><p>Changes are only published when you save at the bottom of the editor.</p><ol>{['Details','Guest rules','Delivery','Pass design','Typography'].map((label, index) => <li key={label}><span>{index + 1}</span>{label}</li>)}</ol></div><div className="admin-editor-guide"><h3>Current delivery</h3><p>{whatsappEnabled ? rsvpEnabled ? 'Guests confirm attendance before their pass is released.' : 'Passes are delivered directly using the current timing.' : 'WhatsApp delivery is currently disabled.'}</p></div></aside></div>
    </div>
  )
}
