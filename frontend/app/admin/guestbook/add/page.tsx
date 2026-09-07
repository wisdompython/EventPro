'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api, Event, CreateGuestPayload } from '@/lib/api'
import { GuestForm } from '@/components/guests/GuestForm'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

export default function AddGuestPage() {
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getEvents().then(setEvents).catch(console.error)
  }, [])

  function handleEventChange(id: string) {
    const ev = events.find((e) => String(e.id) === id) ?? null
    setSelectedEvent(ev)
  }

  const requiredFields: string[] = selectedEvent
    ? [
        'full_name',
        ...( selectedEvent.required_fields ?? [] ),
        ...( selectedEvent.whatsapp_enabled ? ['phone_number'] : [] ),
      ]
    : ['full_name', 'phone_number']

  const ticketOptions = selectedEvent?.ticket_types?.length
    ? selectedEvent.ticket_types as { value: string; label: string }[]
    : [{ value: 'general', label: 'General' }, { value: 'vip', label: 'VIP' }, { value: 'vvip', label: 'VVIP' }]

  const uniqueRequired = [...new Set(requiredFields)]

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setSubmitting(true)
    const form = e.currentTarget
    const getValue = (name: string) =>
      (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value ?? ''
    const scheduledSendAt = getValue('scheduled_send_at')
    const asoEbiRequested = (form.elements.namedItem('aso_ebi_requested') as HTMLInputElement | null)?.checked ?? false
    const plusOneAttending = (form.elements.namedItem('plus_one_attending') as HTMLInputElement | null)?.checked ?? false
    const payload: CreateGuestPayload = {
      full_name:    getValue('full_name'),
      phone_number: getValue('phone_number'),
      email:        getValue('email'),
      ticket_type:  getValue('ticket_type'),
      seating_area: getValue('seating_area'),
      table_number: getValue('table_number'),
      seat_number:  getValue('seat_number'),
      aso_ebi_requested: asoEbiRequested,
      aso_ebi_quantity: asoEbiRequested ? Number(getValue('aso_ebi_quantity')) : 0,
      plus_one_attending: plusOneAttending,
      plus_one_full_name: plusOneAttending ? getValue('plus_one_full_name') : '',
      plus_one_phone_number: plusOneAttending ? getValue('plus_one_phone_number') : '',
      celebrant_name: getValue('celebrant_name'),
      event:        selectedEvent ? selectedEvent.id : null,
      scheduled_send_at: scheduledSendAt ? new Date(scheduledSendAt).toISOString() : null,
    }
    try {
      await api.createGuest(payload)
      router.push('/admin/guestbook')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add guest.')
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-page admin-page--editor">
      <AdminPageHeader eyebrow="Guestbook" title="Add a guest" description="Register a guest, assign their access level and capture the details required by their event." />
      {error && <div className="mb-6 rounded-[14px] border border-red-200 bg-red-50 px-5 py-3.5 text-sm text-red-700">{error}</div>}
      <div className="admin-editor-grid">
        <div className="admin-editor-main"><GuestForm
          events={events} selectedEvent={selectedEvent} submitting={submitting}
          uniqueRequired={uniqueRequired} ticketOptions={ticketOptions}
          onSubmit={handleSubmit} onEventChange={handleEventChange}
          onCancel={() => router.push('/admin/guestbook')}
        /></div>
        <aside className="admin-editor-aside">
          <div className="admin-editor-guide"><h3>Guest setup</h3><p>Event settings decide which details are required and whether a pass is sent automatically.</p><ol><li><span>1</span>Select the event</li><li><span>2</span>Add guest details</li><li><span>3</span>Review delivery</li></ol></div>
          <div className="admin-editor-guide"><h3>What happens next?</h3><p>{selectedEvent?.whatsapp_enabled ? 'Event Pro will prepare this guest’s pass using the event delivery rules.' : 'The guest will be added without an automatic WhatsApp message.'}</p></div>
        </aside>
      </div>
    </div>
  )
}
