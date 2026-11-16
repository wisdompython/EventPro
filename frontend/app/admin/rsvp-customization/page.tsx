'use client'

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminLoadError } from '@/components/admin/AdminLoadError'
import { ConfirmDialog, type ConfirmRequest } from '@/components/admin/ConfirmDialog'
import { RsvpDraftPreview } from '@/components/admin/RsvpDraftPreview'
import { api, Event, EventRsvpCustomization } from '@/lib/api'
import { useAuth, useRequireAuth } from '@/lib/auth'

type AssetName = 'rsvp_logo' | 'rsvp_hero_image' | 'rsvp_background_image'
type UnpublishedDraft = {
  draft: EventRsvpCustomization
  published: EventRsvpCustomization
  assets: Partial<Record<AssetName, File>>
  clearedAssets: Partial<Record<AssetName, boolean>>
}

// Keep work across client-side Back/Forward navigation without storing guest
// content or image files on disk. Full-page exits still use beforeunload.
const unpublishedDrafts = new Map<string, UnpublishedDraft>()

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
  const { user } = useAuth()
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<EventRsvpCustomization | null>(null)
  const [published, setPublished] = useState<EventRsvpCustomization | null>(null)
  const [assets, setAssets] = useState<Partial<Record<AssetName, File>>>({})
  const [clearedAssets, setClearedAssets] = useState<Partial<Record<AssetName, boolean>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [eventsError, setEventsError] = useState('')
  const [draftError, setDraftError] = useState('')
  const [eventsAttempt, setEventsAttempt] = useState(0)
  const [draftAttempt, setDraftAttempt] = useState(0)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [assetPreviews, setAssetPreviews] = useState<Partial<Record<AssetName, string>>>({})
  const inputs = useRef<Partial<Record<AssetName, HTMLInputElement | null>>>({})
  const generation = useRef(0)
  const allowLeave = useRef(false)
  const editorScope = `${user?.id ?? ''}:${user?.active_organization?.id ?? ''}`
  const dirty = !!draft && !!published && (
    draft.rsvp_message !== published.rsvp_message || draft.color_of_day !== published.color_of_day
    || COLORS.some(({ name }) => draft[name] !== published[name])
    || ASSETS.some(({ name }) => !!assets[name] || !!clearedAssets[name])
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true); setEventsError('')
    api.getEvents()
      .then((result) => {
        if (cancelled) return
        setEvents(result)
        const requestedId = Number(new URLSearchParams(window.location.search).get('event'))
        setSelectedId(result.find((event) => event.id === requestedId)?.id ?? result[0]?.id ?? null)
      })
      .catch(() => { if (!cancelled) setEventsError('Could not load your events.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [eventsAttempt])

  useEffect(() => {
    const current = ++generation.current
    if (!selectedId) { setDraft(null); setPublished(null); return }
    setDraft(null); setPublished(null); setAssets({}); setClearedAssets({}); setError(''); setMessage(''); setDraftError('')
    const url = new URL(window.location.href)
    url.searchParams.set('event', String(selectedId))
    window.history.replaceState(window.history.state, '', url)
    api.getEventRsvpCustomization(selectedId)
      .then((result) => {
        if (generation.current !== current) return
        const recovered = unpublishedDrafts.get(`${editorScope}:${selectedId}`)
        if (recovered) {
          setDraft(recovered.draft); setPublished(recovered.published)
          setAssets(recovered.assets); setClearedAssets(recovered.clearedAssets)
          setMessage('Recovered unpublished changes from your previous visit. Review and publish or discard them.')
        } else { setDraft(result); setPublished(result) }
      })
      .catch((err) => { if (generation.current === current) setDraftError(err instanceof Error ? err.message : 'Could not load this RSVP page.') })
    return () => { generation.current++ }
  }, [selectedId, draftAttempt, editorScope])

  useEffect(() => {
    if (!draft || !published || draft.id !== selectedId) return
    const key = `${editorScope}:${draft.id}`
    if (dirty) unpublishedDrafts.set(key, { draft, published, assets, clearedAssets })
    else unpublishedDrafts.delete(key)
  }, [draft, published, assets, clearedAssets, dirty, selectedId, editorScope])

  useEffect(() => {
    const urls: Partial<Record<AssetName, string>> = {}
    ASSETS.forEach(({ name }) => { if (assets[name]) urls[name] = URL.createObjectURL(assets[name]!) })
    setAssetPreviews(urls)
    return () => { Object.values(urls).forEach((url) => URL.revokeObjectURL(url)) }
  }, [assets])

  useEffect(() => {
    if (!dirty && !saving) return
    function beforeUnload(event: BeforeUnloadEvent) {
      if (allowLeave.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    function onLink(event: MouseEvent) {
      if (allowLeave.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const destination = new URL(anchor.href, window.location.href)
      if (!['http:', 'https:'].includes(destination.protocol) || (destination.pathname === window.location.pathname && destination.search === window.location.search)) return
      event.preventDefault()
      event.stopPropagation()
      if (saving) { setError('Please wait for publishing to finish before leaving.'); return }
      setConfirm({
        title: 'Leave with unpublished changes?',
        body: 'Your changes have not been published. Discard them and leave this page?',
        confirmLabel: 'Discard and leave',
        onConfirm: () => {
          allowLeave.current = true
          if (draft) unpublishedDrafts.delete(`${editorScope}:${draft.id}`)
          if (destination.origin === window.location.origin) router.push(destination.pathname + destination.search + destination.hash)
          else window.location.assign(destination.href)
        },
      })
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', onLink, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', onLink, true)
    }
  }, [dirty, saving, router, draft, editorScope])

  function discard() {
    if (draft) unpublishedDrafts.delete(`${editorScope}:${draft.id}`)
    setDraft(published); setAssets({}); setClearedAssets({}); setError(''); setMessage('')
    Object.values(inputs.current).forEach((input) => { if (input) input.value = '' })
  }

  function chooseEvent(id: number) {
    if (id === selectedId || saving) return
    const change = () => { discard(); setSelectedId(id) }
    if (dirty) setConfirm({ title: 'Discard unpublished changes?', body: 'Publish your changes before switching events, or discard them to continue.', confirmLabel: 'Discard and switch', onConfirm: change })
    else change()
  }

  function update<K extends keyof EventRsvpCustomization>(name: K, value: EventRsvpCustomization[K]) {
    setMessage('')
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
    setError(''); setMessage('')
  }

  function removeAsset(name: AssetName) {
    setMessage('')
    setAssets((current) => ({ ...current, [name]: undefined }))
    setClearedAssets((current) => ({ ...current, [name]: true }))
    if (inputs.current[name]) inputs.current[name]!.value = ''
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !selectedId || draft.id !== selectedId || saving || !dirty) return
    const eventId = draft.id
    const current = generation.current
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
      const updated = await api.updateEventRsvpCustomization(eventId, body)
      unpublishedDrafts.delete(`${editorScope}:${eventId}`)
      if (generation.current !== current) return
      setDraft(updated); setPublished(updated); setAssets({}); setClearedAssets({})
      Object.values(inputs.current).forEach((input) => { if (input) input.value = '' })
      setMessage('RSVP page published. New guest visits will use this design.')
    } catch (err) {
      if (generation.current === current) setError(err instanceof Error ? err.message : 'Could not publish the RSVP page.')
    } finally {
      if (generation.current === current) setSaving(false)
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

      {eventsError ? <AdminLoadError message={eventsError} onRetry={() => setEventsAttempt((value) => value + 1)} /> : loading ? <div role="status" className="admin-surface p-6 text-sm" style={{ color: 'var(--muted)' }}>Loading events…</div> : events.length === 0 ? (
        <div className="admin-surface p-6 text-sm" style={{ color: 'var(--muted)' }}>Create an event before customizing its RSVP page.</div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="admin-surface hidden overflow-hidden xl:block">
            <div className="border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}><h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Choose an event</h2></div>
            <div className="max-h-[520px] overflow-y-auto p-2">
              {events.map((event) => <button key={event.id} type="button" disabled={saving} aria-pressed={selectedId === event.id} onClick={() => chooseEvent(event.id)} className="w-full rounded-xl px-3 py-3 text-left transition disabled:opacity-60" style={{ background: selectedId === event.id ? 'var(--brand-soft)' : 'transparent', color: 'var(--ink)' }}>
                <span className="block truncate text-sm font-semibold">{event.name}</span>
                <span className="mt-1 block text-xs" style={{ color: 'var(--muted)' }}>{new Date(event.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </button>)}
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
          <label className="block xl:hidden"><span className="form-label">Event</span><select className="form-control mt-2 w-full" value={selectedId ?? ''} disabled={saving} onChange={(event) => chooseEvent(Number(event.target.value))}>{events.map((event) => <option key={event.id} value={event.id}>{event.name} · {new Date(event.date).toLocaleDateString('en-GB')}</option>)}</select></label>
          {draftError ? <AdminLoadError message={draftError} onRetry={() => setDraftAttempt((value) => value + 1)} /> : !draft || draft.id !== selectedId ? <div role="status" className="admin-surface p-6 text-sm" style={{ color: 'var(--muted)' }}>Loading RSVP customization…</div> : (
            <form onSubmit={save} className="space-y-5">
              <fieldset disabled={saving} className="min-w-0 space-y-5">
              <section className="admin-surface p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>{draft.name}</h2><p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Content shown to every guest invited to this event.</p></div><p role="status" className="text-sm font-semibold text-[var(--brand)]">{saving ? 'Publishing…' : dirty ? 'Unpublished changes' : 'Published design'}</p></div>
                <div className="mt-6 grid gap-5 lg:grid-cols-2">
                  <label className="block"><span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Welcome message</span><span className="mt-1 block text-xs" style={{ color: 'var(--muted)' }}>Use plain text; line breaks are preserved on the guest page.</span><textarea value={draft.rsvp_message} onChange={(event) => update('rsvp_message', event.target.value)} rows={7} className="mt-3 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]" style={{ borderColor: 'var(--line)', background: 'var(--field)', color: 'var(--ink)' }} placeholder="Welcome. Please confirm your availability…" /></label>
                  <label className="block"><span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Optional callout</span><span className="mt-1 block text-xs" style={{ color: 'var(--muted)' }}>For example: dress code, colour of the day, or arrival instructions.</span><input value={draft.color_of_day} onChange={(event) => update('color_of_day', event.target.value)} maxLength={255} className="mt-3 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]" style={{ borderColor: 'var(--line)', background: 'var(--field)', color: 'var(--ink)' }} placeholder="e.g. Smart casual · doors open at 5pm" /></label>
                </div>
              </section>

              <section className="admin-surface p-5 sm:p-6"><h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Colours</h2><p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Choose a clear, accessible theme for this event.</p><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{COLORS.map(({ name, label }) => <div key={name} className="rounded-xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}><label htmlFor={`${name}-hex`} className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{label}</label><span className="mt-3 flex items-center gap-2"><input type="color" aria-label={`${label} colour picker`} value={/^#[0-9a-fA-F]{6}$/.test(draft[name]) ? draft[name] : '#000000'} onChange={(event) => update(name, event.target.value)} className="h-9 w-10 cursor-pointer rounded border-0 bg-transparent p-0" /><input id={`${name}-hex`} value={draft[name]} required onChange={(event) => update(name, event.target.value)} pattern="#[0-9a-fA-F]{6}" title="Enter a six-digit hex colour, such as #6757d9" className="min-w-0 flex-1 rounded-lg border px-2 py-2 font-mono text-xs" style={{ borderColor: 'var(--line)', background: 'var(--field)', color: 'var(--ink)' }} /></span></div>)}</div></section>

              <section className="admin-surface p-5 sm:p-6"><h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Images</h2><p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>PNG, JPEG, or WebP, up to 8 MB. The cover image is shared by all guests; a guest-specific invitation image still takes priority.</p><div className="mt-5 grid gap-4 lg:grid-cols-3">{ASSETS.map(({ name, title, description }) => <article key={name} className="rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}><h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</h3><p className="mt-1 min-h-10 text-xs leading-5" style={{ color: 'var(--muted)' }}>{description}</p>{(assetPreviews[name] || draft[name]) && !clearedAssets[name] && <img src={assetPreviews[name] || draft[name] || ''} alt={`${title} preview`} className="mt-3 h-24 w-full rounded-lg object-contain" style={{ border: '1px solid var(--line)' }} />}{assets[name] && <p className="mt-3 truncate text-xs font-medium" style={{ color: 'var(--brand)' }}>Ready: {assets[name]!.name}</p>}<input ref={(node) => { inputs.current[name] = node }} type="file" aria-label={`Upload ${title.toLowerCase()}`} accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseAsset(name, event)} className="mt-4 block w-full text-xs" style={{ color: 'var(--muted)' }} />{(draft[name] || assets[name]) && !clearedAssets[name] && <button type="button" aria-label={`Remove ${title.toLowerCase()}`} onClick={() => removeAsset(name)} className="mt-3 text-xs font-semibold" style={{ color: 'var(--danger)' }}>Remove image</button>}</article>)}</div></section>
              </fieldset>
              <RsvpDraftPreview draft={{ ...draft, ...Object.fromEntries(ASSETS.map(({ name }) => [name, clearedAssets[name] ? null : assetPreviews[name] || draft[name]])) }} event={events.find((event) => event.id === selectedId)} organizationName={user?.active_organization?.name || 'Event Pro'} />
              <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-lg">
                <p className="text-sm text-[var(--muted)]">{dirty ? 'Publish to update new guest visits.' : 'No unpublished changes.'}</p>
                <div className="flex flex-wrap gap-2"><button type="button" disabled={!dirty || saving} className="admin-secondary-action disabled:opacity-50" onClick={() => setConfirm({ title: 'Discard unpublished changes?', confirmLabel: 'Discard changes', onConfirm: discard })}>Discard changes</button><button disabled={saving || !dirty} className="admin-primary-action disabled:opacity-50">{saving ? 'Publishing…' : 'Publish RSVP page'}</button></div>
              </div>
            </form>
          )}
          </div>
        </div>
      )}
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  )
}
