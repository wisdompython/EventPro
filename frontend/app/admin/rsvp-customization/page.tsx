'use client'

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'

import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { api, Event, EventRsvpCustomization } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'

type AssetName = 'rsvp_logo' | 'rsvp_hero_image' | 'rsvp_background_image'

const ASSETS: Array<{ name: AssetName; title: string; description: string }> = [
  { name: 'rsvp_logo', title: 'Logo', description: 'Shown beside your organization name in the RSVP header.' },
  { name: 'rsvp_hero_image', title: 'Event cover image', description: 'A shared cover image shown above the RSVP details.' },
  { name: 'rsvp_background_image', title: 'Page background', description: 'An optional image placed behind the RSVP card.' },
]

const COLORS: Array<{ name: keyof Pick<EventRsvpCustomization, 'rsvp_primary_color' | 'rsvp_background_color' | 'rsvp_card_color' | 'rsvp_text_color'>; label: string }> = [
  { name: 'rsvp_primary_color', label: 'Accent' },
  { name: 'rsvp_background_color', label: 'Page background' },
  { name: 'rsvp_card_color', label: 'Card' },
  { name: 'rsvp_text_color', label: 'Text' },
]

function isValidImage(file: File) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 8 * 1024 * 1024
}

export default function RsvpCustomizationPage() {
  useRequireAuth('super_admin')
  const [events, setEvents] = useState<Event[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<EventRsvpCustomization | null>(null)
  const [assets, setAssets] = useState<Partial<Record<AssetName, File>>>({})
  const [clearedAssets, setClearedAssets] = useState<Partial<Record<AssetName, boolean>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const inputs = useRef<Partial<Record<AssetName, HTMLInputElement | null>>>({})

  useEffect(() => {
    api.getEvents()
      .then((result) => {
        setEvents(result)
        setSelectedId(result[0]?.id ?? null)
      })
      .catch(() => setError('Could not load your events.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) { setDraft(null); return }
    setDraft(null); setAssets({}); setClearedAssets({}); setError(''); setMessage('')
    api.getEventRsvpCustomization(selectedId)
      .then(setDraft)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this RSVP page.'))
  }, [selectedId])

  function update<K extends keyof EventRsvpCustomization>(name: K, value: EventRsvpCustomization[K]) {
    setDraft((current) => current ? { ...current, [name]: value } : current)
  }

  function chooseAsset(name: AssetName, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!isValidImage(file)) {
      setError('Use a PNG, JPEG, or WebP image that is 8 MB or smaller.')
      event.target.value = ''
      return
    }
    setAssets((current) => ({ ...current, [name]: file }))
    setClearedAssets((current) => ({ ...current, [name]: false }))
    setError('')
  }

  function removeAsset(name: AssetName) {
    setAssets((current) => ({ ...current, [name]: undefined }))
    setClearedAssets((current) => ({ ...current, [name]: true }))
    if (inputs.current[name]) inputs.current[name]!.value = ''
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !selectedId) return
    setSaving(true); setError(''); setMessage('')
    const body = new FormData()
    body.append('rsvp_message', draft.rsvp_message)
    body.append('color_of_day', draft.color_of_day)
    COLORS.forEach(({ name }) => body.append(name, draft[name]))
    ASSETS.forEach(({ name }) => {
      if (assets[name]) body.append(name, assets[name]!)
      if (clearedAssets[name]) body.append(`clear_${name}`, 'true')
    })
    try {
      const updated = await api.updateEventRsvpCustomization(selectedId, body)
      setDraft(updated); setAssets({}); setClearedAssets({})
      Object.values(inputs.current).forEach((input) => { if (input) input.value = '' })
      setMessage('RSVP page published. New guest visits will use this design.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish the RSVP page.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Creative studio"
        title="RSVP customization"
        description="Owners and organization administrators can publish the visual identity and welcome content guests see when they RSVP."
      />

      {(error || message) && <div role={error ? 'alert' : 'status'} className="mb-5 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: error ? 'rgba(239,68,68,0.3)' : 'rgba(22,163,74,0.28)', background: error ? 'rgba(239,68,68,0.08)' : 'rgba(22,163,74,0.08)', color: error ? 'var(--danger)' : 'var(--success)' }}>{error || message}</div>}

      {loading ? <div className="admin-surface p-6 text-sm" style={{ color: 'var(--muted)' }}>Loading events…</div> : events.length === 0 ? (
        <div className="admin-surface p-6 text-sm" style={{ color: 'var(--muted)' }}>Create an event before customizing its RSVP page.</div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="admin-surface overflow-hidden">
            <div className="border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}><h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Choose an event</h2></div>
            <div className="max-h-[520px] overflow-y-auto p-2">
              {events.map((event) => <button key={event.id} type="button" onClick={() => setSelectedId(event.id)} className="w-full rounded-xl px-3 py-3 text-left transition" style={{ background: selectedId === event.id ? 'var(--brand-soft)' : 'transparent', color: 'var(--ink)' }}>
                <span className="block truncate text-sm font-semibold">{event.name}</span>
                <span className="mt-1 block text-xs" style={{ color: 'var(--muted)' }}>{new Date(event.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </button>)}
            </div>
          </aside>

          {!draft ? <div className="admin-surface p-6 text-sm" style={{ color: 'var(--muted)' }}>Loading RSVP customization…</div> : (
            <form onSubmit={save} className="space-y-5">
              <section className="admin-surface p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>{draft.name}</h2><p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Content shown to every guest invited to this event.</p></div><button disabled={saving} className="admin-primary-action disabled:opacity-60">{saving ? 'Publishing…' : 'Publish RSVP page'}</button></div>
                <div className="mt-6 grid gap-5 lg:grid-cols-2">
                  <label className="block"><span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Welcome message</span><span className="mt-1 block text-xs" style={{ color: 'var(--muted)' }}>Use plain text; line breaks are preserved on the guest page.</span><textarea value={draft.rsvp_message} onChange={(event) => update('rsvp_message', event.target.value)} rows={7} className="mt-3 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]" style={{ borderColor: 'var(--line)', background: 'var(--field)', color: 'var(--ink)' }} placeholder="Welcome. Please confirm your availability…" /></label>
                  <label className="block"><span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Optional callout</span><span className="mt-1 block text-xs" style={{ color: 'var(--muted)' }}>For example: dress code, colour of the day, or arrival instructions.</span><input value={draft.color_of_day} onChange={(event) => update('color_of_day', event.target.value)} maxLength={255} className="mt-3 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]" style={{ borderColor: 'var(--line)', background: 'var(--field)', color: 'var(--ink)' }} placeholder="e.g. Smart casual · doors open at 5pm" /></label>
                </div>
              </section>

              <section className="admin-surface p-5 sm:p-6"><h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Colours</h2><p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Choose a clear, accessible theme for this event.</p><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{COLORS.map(({ name, label }) => <label key={name} className="rounded-xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}><span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{label}</span><span className="mt-3 flex items-center gap-2"><input type="color" value={draft[name]} onChange={(event) => update(name, event.target.value)} className="h-9 w-10 cursor-pointer rounded border-0 bg-transparent p-0" /><input value={draft[name]} onChange={(event) => update(name, event.target.value)} pattern="#[0-9a-fA-F]{6}" className="min-w-0 flex-1 rounded-lg border px-2 py-2 font-mono text-xs" style={{ borderColor: 'var(--line)', background: 'var(--field)', color: 'var(--ink)' }} /></span></label>)}</div></section>

              <section className="admin-surface p-5 sm:p-6"><h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Images</h2><p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>PNG, JPEG, or WebP, up to 8 MB. The cover image is shared by all guests; a guest-specific invitation image still takes priority.</p><div className="mt-5 grid gap-4 lg:grid-cols-3">{ASSETS.map(({ name, title, description }) => <article key={name} className="rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}><h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</h3><p className="mt-1 min-h-10 text-xs leading-5" style={{ color: 'var(--muted)' }}>{description}</p>{draft[name] && !clearedAssets[name] && <img src={draft[name] ?? ''} alt="" className="mt-3 h-24 w-full rounded-lg object-cover" style={{ border: '1px solid var(--line)' }} />}{assets[name] && <p className="mt-3 truncate text-xs font-medium" style={{ color: 'var(--brand)' }}>Ready: {assets[name]!.name}</p>}<input ref={(node) => { inputs.current[name] = node }} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseAsset(name, event)} className="mt-4 block w-full text-xs" style={{ color: 'var(--muted)' }} />{(draft[name] || assets[name]) && !clearedAssets[name] && <button type="button" onClick={() => removeAsset(name)} className="mt-3 text-xs font-semibold" style={{ color: 'var(--danger)' }}>Remove image</button>}</article>)}</div></section>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
