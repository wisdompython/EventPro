'use client'

import { useState, useEffect } from 'react'
import { api, WhatsAppTemplate, TemplateCategory, Event } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'
import { FormSectionHeader } from '@/components/ui/FormSectionHeader'
import './message-library.css'

const PAGE_SIZE = 20

const VAR_EXAMPLES: Record<string, string> = {
  guest_name:   'John Doe',
  event_name:   'The Grand Birthday Bash',
  event_date:   'Friday, 20 June 2025 at 7:00 PM',
  event_date_only: '16th September 2026',
  event_time:   '1:00 PM',
  venue:        'The Eko Hotel, Lagos',
  ticket_type:  'VIP',
  table_number: 'Table 12',
  seat_number:  'Seat 4A',
  rsvp_link:    'https://guestpass.example/funke-adeyoriju-60/rsvp/rita-aivoji-A7kP4m',
  rsvp_deadline: '9th September 2026',
}

type FormState = {
  name: string
  display_name: string
  description: string
  category: number | null
  body_text: string
  body_params: string[]
  has_header_image: boolean
  built_for_event: number | null
}

const EMPTY_FORM: FormState = {
  name: '', display_name: '', description: '', category: null,
  body_text: '', body_params: [], has_header_image: false,
  built_for_event: null,
}

function resolvePreview(bodyText: string, bodyParams: string[]): string {
  let text = bodyText
  bodyParams.forEach((key, i) => {
    text = text.replaceAll(`{{${i + 1}}}`, VAR_EXAMPLES[key] ?? `[${key}]`)
  })
  return text
}

function countPlaceholders(bodyText: string): number {
  const matches = bodyText.match(/\{\{\d+\}\}/g) ?? []
  const nums = matches.map((m) => parseInt(m.replace(/\D/g, ''), 10))
  return nums.length > 0 ? Math.max(...nums) : 0
}

function PreviewBubble({ bodyText, bodyParams, hasHeaderImage }: {
  bodyText: string; bodyParams: string[]; hasHeaderImage: boolean
}) {
  const preview = resolvePreview(bodyText, bodyParams)
  const placeholderCount = countPlaceholders(bodyText)
  const mismatch = Boolean(bodyText.trim()) && placeholderCount !== bodyParams.length

  return (
    <div className="message-preview-phone">
      <div className="message-preview-phone__bar">
        <span>EP</span>
        <div><strong>Event Pro</strong><small>Business account</small></div>
        <i>•••</i>
      </div>
      <div className="message-preview-phone__chat">
        <div className={`message-preview-bubble${!bodyText.trim() ? ' is-empty' : ''}`}>
        {hasHeaderImage && (
          <div className="message-preview-media">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m5 18 5-5 3 3 2-2 4 4"/>
            </svg>
            <span>Personalised guest artwork</span>
          </div>
        )}
          <p>{preview || 'Your approved WhatsApp message will appear here as you type.'}</p>
          <time>11:15 <span>✓✓</span></time>
        </div>
      </div>
      <div className={`message-preview-note${mismatch ? ' has-error' : ''}`}>
        {mismatch
          ? `Message has ${placeholderCount} placeholder${placeholderCount === 1 ? '' : 's'}, but ${bodyParams.length} variable${bodyParams.length === 1 ? '' : 's'} mapped.`
          : bodyParams.length
            ? 'Example data shown. Each guest receives their real details.'
            : 'Add numbered placeholders to personalise this message.'}
      </div>
    </div>
  )
}

function TemplateForm({
  form, setForm, categories, availableVars, events, error, submitting, submitLabel, onSubmit, onCancel, isNew,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  categories: TemplateCategory[]
  availableVars: { key: string; label: string }[]
  events: Event[]
  error: string
  submitting: boolean
  submitLabel: string
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  isNew: boolean
}) {
  const varLabel = (key: string) => availableVars.find((v) => v.key === key)?.label ?? key
  const usageCount = (key: string) => form.body_params.filter((item) => item === key).length

  function addParam(key: string) {
    setForm((f) => ({ ...f, body_params: [...f.body_params, key] }))
  }
  function removeParam(i: number) {
    setForm((f) => ({ ...f, body_params: f.body_params.filter((_, idx) => idx !== i) }))
  }
  function moveParam(i: number, dir: -1 | 1) {
    setForm((f) => {
      const arr = [...f.body_params]
      const j = i + dir
      if (j < 0 || j >= arr.length) return f;
      [arr[i], arr[j]] = [arr[j], arr[i]]
      return { ...f, body_params: arr }
    })
  }

  function useRsvpStarter() {
    setForm((f) => ({
      ...f,
      name: 'event_rsvp_invitation',
      display_name: 'Event RSVP Invitation',
      description: 'Invites a guest to confirm availability using their secure RSVP link.',
      body_text: '*RSVP Request: {{2}}* 📩\n\nDear *{{1}}*,\n\nPlease confirm your availability for *{{3}}* by clicking the link below:\n{{4}}\n\n*Event Details*\n\nDate: {{5}}\nTime: {{6}}\nVenue: {{7}}\nRSVP by: {{8}}\n\nOnce confirmed, you will automatically receive your personalised QR access card.',
      body_params: ['guest_name', 'event_name', 'event_name', 'rsvp_link', 'event_date_only', 'event_time', 'venue', 'rsvp_deadline'],
      has_header_image: false,
    }))
  }

  const placeholderCount = countPlaceholders(form.body_text)
  const mismatch = Boolean(form.body_text.trim()) && placeholderCount !== form.body_params.length

  return (
    <form onSubmit={onSubmit} className="message-template-form">
      <div className="message-template-form__fields">
      {error && (
        <p className="message-template-form__error">
          {error}
        </p>
      )}

      {isNew && (
        <div className="message-rsvp-starter">
          <div>
            <span>Quick start</span>
            <p>Creating an RSVP invitation?</p>
            <small>Load recommended copy and variable order, then match it to your approved Meta template.</small>
          </div>
          <button type="button" onClick={useRsvpStarter}>Use RSVP starter <i>→</i></button>
        </div>
      )}

      <section className="form-card message-form-section message-form-section--identity">
      <FormSectionHeader step={1} title="Template identity" description="Use the exact Meta name, plus a friendly name your team will recognise." />

      <div className="p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">
            Template name *
          </label>
          <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. birthday_invite_v1"
            className="form-control mt-2" />
          <p className="form-hint">Copy this exactly from Meta Business Manager.</p>
        </div>
        <div>
          <label className="form-label">
            Display name <span className="font-normal text-[var(--muted-2)]">(optional)</span>
          </label>
          <input value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            placeholder="e.g. Birthday Invite"
            className="form-control mt-2" />
          <p className="form-hint">Shown only to your team.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="form-label">Description <span className="font-normal text-[var(--muted-2)]">(optional)</span></label>
          <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What is this template used for?" className="form-control mt-2" />
        </div>
      </div>

      <div className="mt-4">
        <label className="form-label">
          Category <span className="font-normal text-[var(--muted-2)]">(optional)</span>
        </label>
        <select
          value={form.category ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value ? Number(e.target.value) : null }))}
          className="form-control mt-2">
          <option value="">— No category —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      </div>
      </section>

      <section className="form-card message-form-section message-form-section--body">
        <FormSectionHeader step={2} title="Approved message" description="Paste the body exactly as approved by Meta. Number variables in the order they appear." />
        <div className="p-5">
        <label className="form-label">
          Message body
        </label>
        <textarea
          value={form.body_text}
          onChange={(e) => setForm((f) => ({ ...f, body_text: e.target.value }))}
          rows={6}
          placeholder={"Hello {{1}}, you're invited to {{2}} on {{3}}.\n\nPlease find your guest pass attached."}
          className={`form-control mt-2 min-h-40 ${mismatch ? 'border-red-500/60' : ''}`}
        />
        <p className="form-hint">
          Use {'{{1}}'}, {'{{2}}'}, and so on. Each number is connected to guest or event data next.
        </p>
        </div>
      </section>

      <section className="form-card message-form-section message-form-section--media">
      <FormSectionHeader step={3} title="Delivery media" description="RSVP invitations are normally text-only. Pass messages can include the generated pass image." />
      <div className={`message-media-choice${form.has_header_image ? ' is-selected' : ''}`}>
        <button type="button"
          onClick={() => setForm((f) => ({ ...f, has_header_image: !f.has_header_image }))}
          className="message-media-toggle"
          aria-pressed={form.has_header_image}>
          <span />
        </button>
        <div>
          <p>{form.has_header_image ? 'Image header enabled' : 'Text-only template'}</p>
          <small>{form.has_header_image ? 'The personalised guest pass or RSVP artwork will be attached.' : 'Enable this only when the approved Meta template has an image header.'}</small>
        </div>
      </div>
      </section>
      </div>

      <section className="form-card message-form-section message-form-section--variables">
        <FormSectionHeader step={4} title="Map placeholders" description="Add one value for every numbered placeholder. The same value can be mapped more than once." />
        <div className="message-variable-mapper">
        {form.body_params.length === 0 && (
          <div className="message-variable-empty"><strong>No variables mapped</strong><span>Add a guest or event field for every numbered placeholder in the message.</span></div>
        )}
        {form.body_params.map((key, i) => (
          <div key={i} className="message-variable-row">
            <span className="message-variable-row__number">{`{{${i + 1}}}`}</span>
            <span className="message-variable-row__value">
              <strong>{varLabel(key)}</strong>
              <code>{key}</code>
            </span>
            <span className="message-variable-row__actions">
              <button type="button" onClick={() => moveParam(i, -1)} disabled={i === 0} aria-label={`Move ${varLabel(key)} up`}>↑</button>
              <button type="button" onClick={() => moveParam(i, 1)} disabled={i === form.body_params.length - 1} aria-label={`Move ${varLabel(key)} down`}>↓</button>
              <button type="button" onClick={() => removeParam(i)} aria-label={`Remove ${varLabel(key)}`}>×</button>
            </span>
          </div>
        ))}
        <div className="message-location-scope">
          <label htmlFor="built-for-event">Which event are you writing this for?</label>
          <select
            id="built-for-event"
            value={form.built_for_event ?? ''}
            onChange={(e) => setForm((f) => ({
              ...f,
              built_for_event: e.target.value ? Number(e.target.value) : null,
            }))}
          >
            <option value="">Any event — use general field names</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>{event.name}</option>
            ))}
          </select>
          <small>
            {form.built_for_event
              ? 'Location fields below are named after this event’s own stops, so you can see exactly which one you are adding.'
              : 'Pick an event and the location fields below will show its real stops — “Church”, “Reception” — instead of numbers.'}
          </small>
        </div>

        {availableVars.length > 0 && (
          <div className="message-variable-options">
            <p>Add a guest or event field</p>
            <small>You can select a field more than once.</small>
            <div>
              {availableVars.map((v) => (
                <button key={v.key} type="button" onClick={() => addParam(v.key)}
                  className={usageCount(v.key) > 0 ? 'is-used' : ''}>
                  <span>＋</span>{v.label}{usageCount(v.key) > 0 ? <i>{usageCount(v.key)}×</i> : null}
                </button>
              ))}
            </div>
          </div>
        )}
        </div>

      <div className="message-form-preview">
        <div className="message-form-preview__heading"><span>Live preview</span><small>Example guest data</small></div>
        <PreviewBubble bodyText={form.body_text} bodyParams={form.body_params} hasHeaderImage={form.has_header_image} />
      </div>
      </section>

      <div className="message-template-form__actions">
        <button type="submit" disabled={submitting || !!mismatch}
          className="message-template-form__submit">
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="message-template-form__cancel">
          Cancel
        </button>
        <span>{mismatch ? 'Map every placeholder before saving.' : form.name && form.body_text ? 'Ready to save' : 'Complete the required fields to continue.'}</span>
      </div>
    </form>
  )
}

export default function TemplatesPage() {
  useRequireAuth('event_manager')
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categories, setCategories] = useState<TemplateCategory[]>([])
  const [availableVars, setAvailableVars] = useState<{ key: string; label: string }[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [toast, setToast] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [catSubmitting, setCatSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const selectedTemplate = templates.find((t) => t.id === selectedId)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => { setPage(1) }, [categoryFilter, debouncedSearch])

  useEffect(() => {
    setLoading(true)
    const params: Record<string, string> = { page: String(page), page_size: String(PAGE_SIZE) }
    if (categoryFilter) params.category = categoryFilter
    if (debouncedSearch) params.search = debouncedSearch
    api.getWhatsAppTemplatesPaged(params)
      .then((d) => { setTemplates(d.results); setCount(d.count) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [page, categoryFilter, debouncedSearch])

  useEffect(() => {
    Promise.all([api.getTemplateCategories(), api.getEvents()])
      .then(([cats, evs]) => {
        setCategories(cats)
        setEvents(evs)
      })
      .catch(console.error)
  }, [])

  // Re-fetch whenever the chosen event changes: the location fields are
  // labelled with that event's own stop names, and an event with fewer stops
  // offers fewer slots.
  useEffect(() => {
    let active = true
    api.getAvailableTemplateVars(form.built_for_event)
      .then((vars) => { if (active) setAvailableVars(vars) })
      .catch(console.error)
    return () => { active = false }
  }, [form.built_for_event])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  function revealEditor() {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.admin-main')?.scrollTo({ top: 0, behavior: 'smooth' })
      document.querySelector<HTMLElement>('.message-editor-panel__body')?.scrollTo({ top: 0 })
    })
  }

  function openNew() {
    setSelectedId('new')
    setForm(EMPTY_FORM)
    setFormError('')
    revealEditor()
  }

  function openEdit(t: WhatsAppTemplate) {
    setSelectedId(t.id)
    setForm({
      name: t.name, display_name: t.display_name || '', description: t.description || '',
      category: t.category, body_text: t.body_text || '',
      body_params: t.body_params || [], has_header_image: t.has_header_image,
      built_for_event: t.built_for_event ?? null,
    })
    setFormError('')
    revealEditor()
  }

  function closePanel() { setSelectedId(null); setFormError('') }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(''); setSubmitting(true)
    try {
      if (selectedId === 'new') {
        const t = await api.createWhatsAppTemplate({ ...form, is_active: true })
        setTemplates((prev) => [t, ...prev])
        setCount((c) => c + 1)
        showToast('Template added.')
        closePanel()
      } else if (typeof selectedId === 'number') {
        const updated = await api.updateWhatsAppTemplate(selectedId, form)
        setTemplates((prev) => prev.map((t) => t.id === selectedId ? updated : t))
        showToast('Template saved.')
        closePanel()
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save template.')
    } finally { setSubmitting(false) }
  }

  async function handleDelete(id: number) {
    const template = templates.find((item) => item.id === id)
    if (!confirm(`Delete "${template?.display_name || template?.name || 'this template'}"?\n\nThis cannot be undone. Templates currently used by an event or RSVP setup must be detached first.`)) return
    setDeletingId(id)
    setFormError('')
    try {
      await api.deleteWhatsAppTemplate(id)
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      setCount((c) => c - 1)
      if (selectedId === id) closePanel()
      showToast('Template deleted.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The template could not be deleted.'
      setFormError(message)
      showToast(message)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!newCatName.trim()) return
    setCatSubmitting(true)
    try {
      const cat = await api.createTemplateCategory(newCatName.trim())
      setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)))
      setNewCatName(''); setAddingCat(false)
      showToast(`Category "${cat.name}" added.`)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to add category.')
    } finally { setCatSubmitting(false) }
  }

  async function handleDeleteCategory(cat: TemplateCategory) {
    if (!confirm(`Remove category "${cat.name}"? Templates in this category will become uncategorised.`)) return
    await api.deleteTemplateCategory(cat.id)
    setCategories((prev) => prev.filter((c) => c.id !== cat.id))
    if (categoryFilter === String(cat.id)) setCategoryFilter('')
    showToast(`Category "${cat.name}" removed.`)
  }

  const varLabel = (key: string) => availableVars.find((v) => v.key === key)?.label ?? key

  const panelOpen = selectedId !== null

  return (
    <div className="message-library-page">
      {toast && (
        <div className="message-library-toast" role="status">{toast}</div>
      )}

      <header className="message-library-hero">
        <div className="message-library-hero__identity">
          <p className="admin-page__eyebrow">Creative studio</p>
          <h1 className="admin-page__title">Message library</h1>
          <p className="admin-page__description">
            Manage the approved WhatsApp templates your team uses for invitations, passes and event updates.
          </p>
        </div>
        <div className="message-library-hero__side">
          <div className="message-library-overview" aria-label="Template overview">
            <div><strong>{count}</strong><span>Templates</span></div>
            <div><strong>{categories.length}</strong><span>Categories</span></div>
            <div><strong>{availableVars.length}</strong><span>Guest fields</span></div>
          </div>
          <button onClick={openNew} data-tour="templates-add-button" className="message-library-add">
            <span>＋</span> Add template
          </button>
        </div>
      </header>

      <div className={`message-library-workspace${panelOpen ? ' is-panel-open' : ''}`}>
        <section className="message-library-browser" aria-label="Message templates">
          <div className="message-library-controls">
            <div className="message-library-controls__top">
              <div>
                <strong>Your templates</strong>
                <span>{count} approved message{count === 1 ? '' : 's'} available</span>
              </div>
              <label className="message-library-search">
                <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search templates…"
                  aria-label="Search templates"
                />
                {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search">×</button>}
              </label>
            </div>

            <div className="message-library-categories">
              <div className="message-library-categories__label">
                <span>Categories</span>
                <button onClick={() => setAddingCat((value) => !value)}>{addingCat ? 'Cancel' : '+ New category'}</button>
              </div>
              {addingCat && (
                <form onSubmit={handleAddCategory} className="message-category-form">
                  <input required autoFocus value={newCatName} onChange={(event) => setNewCatName(event.target.value)} placeholder="Category name" />
                  <button type="submit" disabled={catSubmitting}>{catSubmitting ? 'Adding…' : 'Add'}</button>
                </form>
              )}
              <div className="message-category-pills">
                <button onClick={() => setCategoryFilter('')} className={!categoryFilter ? 'is-active' : ''}>
                  All templates <span>{!categoryFilter ? count : '•'}</span>
                </button>
                {categories.map((category) => (
                  <span key={category.id} className={categoryFilter === String(category.id) ? 'is-active' : ''}>
                    <button onClick={() => setCategoryFilter(categoryFilter === String(category.id) ? '' : String(category.id))}>{category.name}</button>
                    <button onClick={() => handleDeleteCategory(category)} aria-label={`Delete ${category.name} category`}>×</button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="message-library-results">
            {loading ? (
              <div className="message-library-state"><i /><strong>Loading templates</strong><p>Preparing your message library…</p></div>
            ) : templates.length === 0 ? (
              <div className="message-library-state">
                <span aria-hidden="true">✉</span>
                <strong>{search ? 'No matching templates' : categoryFilter ? 'This category is empty' : 'Create your first template'}</strong>
                <p>{search ? 'Try another name, Meta identifier, or message phrase.' : 'Add an approved Meta template so your team can start sending messages.'}</p>
                {search || categoryFilter ? (
                  <button onClick={() => { setSearch(''); setCategoryFilter('') }}>Clear filters</button>
                ) : (
                  <button onClick={openNew}>Add template</button>
                )}
              </div>
            ) : (
              <div className="message-template-grid">
                {templates.map((template) => {
                  const isSelected = selectedId === template.id
                  const bodyPreview = template.body_text?.replace(/\s+/g, ' ').trim()
                  return (
                    <article key={template.id} className={`message-template-card${isSelected ? ' is-selected' : ''}`}>
                      <button type="button" onClick={() => isSelected ? closePanel() : openEdit(template)} className="message-template-card__main">
                        <span className={`message-template-card__icon${template.has_header_image ? ' has-image' : ''}`} aria-hidden="true">
                          {template.has_header_image ? (
                            <svg width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="m5 17 4.5-4.5 3 3 2-2L19 17"/></svg>
                          ) : (
                            <svg width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path d="M21 14a4 4 0 0 1-4 4H9l-5 3v-5a6 6 0 0 1-1-3.3V9a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 10h8M8 13h5"/></svg>
                          )}
                        </span>
                        <span className="message-template-card__content">
                          <span className="message-template-card__status"><i className={template.is_active ? 'is-active' : ''} />{template.is_active ? 'Ready to use' : 'Inactive'}</span>
                          <strong>{template.display_name || template.name}</strong>
                          {template.display_name && <code>{template.name}</code>}
                          <span className="message-template-card__description">{template.description || bodyPreview || 'No description added yet.'}</span>
                          <span className="message-template-card__chips">
                            <small>{template.category_name || 'Uncategorised'}</small>
                            <small>{template.has_header_image ? 'Image header' : 'Text only'}</small>
                            <small>{template.body_params?.length || 0} variable{template.body_params?.length === 1 ? '' : 's'}</small>
                          </span>
                          {template.built_for_locations && template.built_for_locations.length > 0 && (
                            // What this template's location numbering meant when
                            // it was written, so the next person need not guess.
                            <span className="message-template-card__builtfor">
                              {template.built_for_locations
                                .map((name, index) => `${index + 1} = ${name}`)
                                .join(' · ')}
                            </span>
                          )}
                        </span>
                      </button>
                      <footer className="message-template-card__footer">
                        <button type="button" onClick={() => openEdit(template)}>Edit template <span>→</span></button>
                        <button type="button" disabled={deletingId === template.id} onClick={() => handleDelete(template.id)}>{deletingId === template.id ? 'Deleting…' : 'Delete'}</button>
                      </footer>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="message-library-pagination">
              <p>{count} templates · Page {page} of {totalPages}</p>
              <div>
                <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>← Previous</button>
                <button onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages}>Next →</button>
              </div>
            </div>
          )}
        </section>

        {panelOpen && (
          <aside className="message-editor-panel">
            <div className="message-editor-panel__header">
              <div>
                <span>{selectedId === 'new' ? 'New template' : 'Editing template'}</span>
                <strong>{selectedTemplate ? selectedTemplate.display_name || selectedTemplate.name : 'Create a message'}</strong>
              </div>
              <div>
                {typeof selectedId === 'number' && (
                  <button onClick={() => handleDelete(selectedId)} disabled={deletingId === selectedId} className="message-editor-delete">{deletingId === selectedId ? 'Deleting…' : 'Delete'}</button>
                )}
                <button onClick={closePanel} className="message-editor-close" aria-label="Close editor">×</button>
              </div>
            </div>

            {selectedId === 'new' && (
              <div className="message-editor-notice">
                <strong>Match your approved Meta template</strong>
                <p>Paste its exact body, including numbered placeholders such as <code>{'{{1}}'}</code> and <code>{'{{2}}'}</code>.</p>
              </div>
            )}

            <div className="message-editor-panel__body">
              <TemplateForm
                form={form} setForm={setForm} categories={categories}
                availableVars={availableVars} events={events} error={formError} submitting={submitting}
                submitLabel={selectedId === 'new' ? 'Add Template' : 'Save Changes'}
                isNew={selectedId === 'new'}
                onSubmit={handleSubmit} onCancel={closePanel}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
