'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type {
  MessagingSettingsAuditEntry,
  MessagingSettingsFieldName,
  MessagingSettingsPayload,
  MessagingSettingsUpdate,
} from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import './settings.css'

/**
 * Every field is described for the organiser running the event, not the
 * engineer running the workers: what the number does to their guests, and what
 * goes wrong if it is set badly. Environment variable names appear only as a
 * secondary note, for whoever they call when something breaks.
 */
type FieldCopy = {
  name: MessagingSettingsFieldName
  label: string
  help: string
  unit?: string
  envVar: string
  kind: 'number' | 'schedule'
}

type Section = {
  id: string
  title: string
  blurb: string
  fields: FieldCopy[]
}

const SECTIONS: Section[] = [
  {
    id: 'sending',
    title: 'Sending to guests on WhatsApp',
    blurb:
      'WhatsApp limits how many guests you can message in a day, and how fast. These settings keep your sending inside those limits so messages arrive instead of failing.',
    fields: [
      {
        name: 'daily_send_limit',
        label: 'Guests you can message per day',
        help:
          'WhatsApp only lets you start conversations with this many new guests in any 24 hours. Set it to the limit shown on your WhatsApp Business account. Setting it higher than your real limit does not send more — the extra messages fail and have to be sent again by hand.',
        unit: 'guests per day',
        envVar: 'WHATSAPP_DAILY_SEND_LIMIT',
        kind: 'number',
      },
      {
        name: 'whatsapp_messages_per_minute',
        label: 'Sending speed for guest passes',
        help:
          'How quickly passes go out. A slower speed takes longer to work through a big list but is gentler on a new or recently restricted number.',
        unit: 'messages per minute',
        envVar: 'WHATSAPP_MESSAGES_PER_MINUTE',
        kind: 'number',
      },
      {
        name: 'rsvp_messages_per_minute',
        label: 'Sending speed for RSVP invitations',
        help:
          'How quickly invitations and reminders go out. Lower this if guests are reporting your messages or deliveries start failing.',
        unit: 'messages per minute',
        envVar: 'RSVP_MESSAGES_PER_MINUTE',
        kind: 'number',
      },
    ],
  },
  {
    id: 'reminders',
    title: 'Reminding guests who have not replied',
    blurb:
      'When a guest does not answer an invitation, Event Pro can nudge them. These settings decide how often, and when to stop.',
    fields: [
      {
        name: 'rsvp_max_reminders',
        label: 'How many reminders one guest can get',
        help:
          'How many times a guest who has not replied can be reminded. Guests who receive repeated unanswered messages may block your number, which affects delivery for all your events.',
        unit: 'reminders per guest',
        envVar: 'RSVP_MAX_REMINDERS',
        kind: 'number',
      },
      {
        name: 'rsvp_reminder_cooldown_minutes',
        label: 'Quiet time between reminders',
        help:
          'The shortest gap between two reminders to the same guest. Short gaps feel like spam to guests and are the fastest way to get a business number reported and blocked.',
        unit: 'minutes',
        envVar: 'RSVP_REMINDER_COOLDOWN_MINUTES',
        kind: 'number',
      },
    ],
  },
  {
    id: 'retries',
    title: 'When a message does not get through',
    blurb:
      'WhatsApp sometimes accepts a message and then fails to deliver it. Event Pro retries those on its own. These settings decide how many times, and how long it waits.',
    fields: [
      {
        name: 'failed_send_max_auto_retries',
        label: 'Automatic retries per guest',
        help:
          'How many times Event Pro tries again before leaving a failed message for you to look at. Retries use up your daily allowance, so a high number on a large list can eat the day’s budget.',
        unit: 'retries',
        envVar: 'FAILED_SEND_MAX_AUTO_RETRIES',
        kind: 'number',
      },
      {
        name: 'failed_send_retry_delay_hours',
        label: 'Wait before each retry',
        help:
          'How long to wait before each attempt, in hours. Most delivery problems clear on their own within a few hours. The last number repeats if there are more attempts than waits listed.',
        unit: 'hours, in order',
        envVar: 'FAILED_SEND_RETRY_DELAY_HOURS',
        kind: 'schedule',
      },
      {
        name: 'ecosystem_retry_delay_hours',
        label: 'Wait when WhatsApp limits a guest',
        help:
          'Some guests hit a WhatsApp limit on promotional messages. That limit clears roughly once a day, so retrying sooner just fails again and wastes your daily allowance. Leave this at a day unless you have been told otherwise.',
        unit: 'hours, in order',
        envVar: 'ECOSYSTEM_RETRY_DELAY_HOURS',
        kind: 'schedule',
      },
    ],
  },
]

const ALL_FIELDS = SECTIONS.flatMap((section) => section.fields)

/** Form state is text so a half-typed value is never coerced to 0. */
type FormState = Record<string, string>

function toInput(value: number | number[]): string {
  return Array.isArray(value) ? value.join(', ') : String(value)
}

function parseSchedule(raw: string): number[] | null {
  const parts = raw.split(/[,\s]+/).map((part) => part.trim()).filter(Boolean)
  if (!parts.length) return null
  const hours = parts.map(Number)
  if (hours.some((hour) => !Number.isInteger(hour) || hour < 1)) return null
  return hours
}

function formFromPayload(payload: MessagingSettingsPayload): FormState {
  const state: FormState = {}
  for (const field of ALL_FIELDS) {
    state[field.name] = toInput(payload.fields[field.name].value)
  }
  return state
}

export default function MessagingSettingsPage() {
  useRequireAuth('super_admin')
  const [payload, setPayload] = useState<MessagingSettingsPayload | null>(null)
  const [form, setForm] = useState<FormState>({})
  const [audit, setAudit] = useState<MessagingSettingsAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [showAudit, setShowAudit] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api.getMessagingSettings()
      setPayload(data)
      setForm(formFromPayload(data))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your messaging settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function loadAudit() {
    setShowAudit(true)
    try {
      setAudit(await api.getMessagingSettingsAudit())
    } catch {
      // The history is supporting detail; a failure here must not block the page.
    }
  }

  /** Which fields the organiser has actually edited, against the saved values. */
  const dirtyFields = useMemo(() => {
    if (!payload) return [] as MessagingSettingsFieldName[]
    return ALL_FIELDS
      .filter((field) => form[field.name] !== toInput(payload.fields[field.name].value))
      .map((field) => field.name)
  }, [form, payload])

  const isDirty = dirtyFields.length > 0

  // Dirty-state guard: warn before a reload or tab close drops unsaved edits.
  useEffect(() => {
    if (!isDirty) return
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  function update(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => {
      if (!current[name]) return current
      const next = { ...current }
      delete next[name]
      return next
    })
  }

  /** Clear this workspace's override so the field follows the platform default. */
  async function resetField(field: FieldCopy) {
    if (!payload) return
    setSaving(true); setError(''); setMessage(''); setFieldErrors({})
    try {
      const updated = await api.updateMessagingSettings({ [field.name]: null })
      setPayload(updated)
      setForm((current) => ({
        ...current,
        [field.name]: toInput(updated.fields[field.name].value),
      }))
      setMessage(`“${field.label}” is back to the recommended setting.`)
      if (showAudit) void loadAudit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset that setting.')
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    if (!payload || !isDirty) return
    setSaving(true); setError(''); setMessage(''); setFieldErrors({})

    const update: MessagingSettingsUpdate = {}
    const localErrors: Record<string, string> = {}

    for (const name of dirtyFields) {
      const field = ALL_FIELDS.find((entry) => entry.name === name)!
      const raw = (form[name] ?? '').trim()
      if (!raw) {
        // An emptied field means "use the recommended setting".
        update[name] = null
        continue
      }
      if (field.kind === 'schedule') {
        const hours = parseSchedule(raw)
        if (!hours) {
          localErrors[name] = 'Enter one or more whole numbers of hours, separated by commas.'
          continue
        }
        update[name] = hours
      } else {
        const value = Number(raw)
        if (!Number.isInteger(value) || value < 1) {
          localErrors[name] = 'Enter a whole number of 1 or more.'
          continue
        }
        update[name] = value
      }
    }

    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors)
      setSaving(false)
      setError('Some settings could not be saved. Check the highlighted fields.')
      return
    }

    try {
      const updated = await api.updateMessagingSettings(update)
      setPayload(updated)
      setForm(formFromPayload(updated))
      setMessage('Messaging settings saved. New sends use these values right away.')
      if (showAudit) void loadAudit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your messaging settings.')
    } finally {
      setSaving(false)
    }
  }

  function discard() {
    if (!payload) return
    setForm(formFromPayload(payload))
    setFieldErrors({})
    setError(''); setMessage('')
  }

  if (loading) {
    return <div className="admin-page admin-page--narrow"><p className="ms-loading">Loading your messaging settings…</p></div>
  }

  if (!payload) {
    return (
      <div className="admin-page admin-page--narrow">
        <AdminPageHeader eyebrow="Company" title="Messaging settings" />
        <p role="alert" className="ms-banner ms-banner--error">{error || 'Messaging settings are unavailable.'}</p>
      </div>
    )
  }

  return (
    <div className="admin-page admin-page--narrow">
      <AdminPageHeader
        eyebrow="Company"
        title="Messaging settings"
        description={`How ${payload.organization_name} sends WhatsApp messages to guests: how many a day, how often to remind, and what happens when a message does not get through.`}
        actions={
          <button type="button" onClick={() => (showAudit ? setShowAudit(false) : void loadAudit())} className="ms-ghost-button">
            {showAudit ? 'Hide change history' : 'Change history'}
          </button>
        }
      />

      {(message || error) && (
        <p role={error ? 'alert' : 'status'} className={`ms-banner ${error ? 'ms-banner--error' : 'ms-banner--success'}`}>
          {error || message}
        </p>
      )}

      {showAudit && (
        <section className="ms-card ms-audit">
          <h2 className="ms-card__title">Change history</h2>
          <p className="ms-card__blurb">Who changed a setting, what it was before, and when. These values affect cost and whether messages get delivered, so every change is recorded.</p>
          {audit.length === 0 ? (
            <p className="ms-audit__empty">No changes yet — every setting is still on its recommended value.</p>
          ) : (
            <ul className="ms-audit__list">
              {audit.map((entry) => {
                const field = ALL_FIELDS.find((item) => item.name === entry.field)
                return (
                  <li key={entry.id} className="ms-audit__item">
                    <div>
                      <b>{field?.label ?? entry.field}</b>
                      <span className="ms-audit__change">{entry.old_value} → {entry.new_value}</span>
                    </div>
                    <span className="ms-audit__meta">{entry.changed_by} · {new Date(entry.changed_at).toLocaleString()}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {SECTIONS.map((section) => (
        <section key={section.id} className="ms-card">
          <div className="ms-card__head">
            <h2 className="ms-card__title">{section.title}</h2>
            <p className="ms-card__blurb">{section.blurb}</p>
          </div>

          <div className="ms-fields">
            {section.fields.map((field) => {
              const meta = payload.fields[field.name]
              const isOverridden = meta.source === 'organization'
              const fieldError = fieldErrors[field.name]
              const edited = dirtyFields.includes(field.name)
              const inputId = `ms-${field.name}`
              return (
                <div key={field.name} className={`ms-field${fieldError ? ' ms-field--invalid' : ''}`}>
                  <div className="ms-field__head">
                    <label htmlFor={inputId} className="ms-field__label">{field.label}</label>
                    {isOverridden
                      ? <span className="ms-tag ms-tag--custom">Your setting</span>
                      : <span className="ms-tag">Recommended</span>}
                  </div>

                  <p className="ms-field__help">{field.help}</p>

                  <div className="ms-field__control">
                    <input
                      id={inputId}
                      value={form[field.name] ?? ''}
                      onChange={(event) => update(field.name, event.target.value)}
                      inputMode={field.kind === 'schedule' ? 'text' : 'numeric'}
                      className="ms-input"
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={fieldError ? `${inputId}-error` : undefined}
                      placeholder={toInput(meta.default)}
                    />
                    {field.unit && <span className="ms-field__unit">{field.unit}</span>}
                    {isOverridden && (
                      <button type="button" onClick={() => resetField(field)} disabled={saving} className="ms-reset">
                        Reset to recommended
                      </button>
                    )}
                  </div>

                  {fieldError && <p id={`${inputId}-error`} role="alert" className="ms-field__error">{fieldError}</p>}

                  <p className="ms-field__foot">
                    <span>Recommended: <b>{toInput(meta.default)}</b>{field.unit ? ` ${field.unit}` : ''}</span>
                    {meta.max !== null && <span>Most you can set: <b>{meta.max}</b></span>}
                    {meta.min !== null && meta.min > 1 && <span>Least you can set: <b>{meta.min}</b></span>}
                    {edited && <span className="ms-field__unsaved">Not saved yet</span>}
                    <span className="ms-field__env">Support reference: {field.envVar}</span>
                  </p>
                </div>
              )
            })}
          </div>

          {section.id === 'sending' && (
            <p className="ms-note">
              <b>Sending speed is capped by your servers.</b> Messages leave at most{' '}
              {payload.worker_rate_limit.per_worker_per_minute} per minute for each sending
              server, whatever you set above. Raising that cap is a change to the server
              configuration ({payload.worker_rate_limit.env_var}) and does not take effect
              until the sending services are restarted — ask your technical contact.
              Lowering the speeds above works straight away, with no restart.
            </p>
          )}
        </section>
      ))}

      <div className={`ms-savebar${isDirty ? ' is-active' : ''}`} role="region" aria-label="Save messaging settings">
        <p className="ms-savebar__status">
          {isDirty
            ? `${dirtyFields.length} unsaved change${dirtyFields.length === 1 ? '' : 's'}`
            : payload.updated_at
              ? `Last changed ${new Date(payload.updated_at).toLocaleString()}${payload.updated_by ? ` by ${payload.updated_by}` : ''}`
              : 'Everything is on its recommended setting.'}
        </p>
        <div className="ms-savebar__actions">
          <button type="button" onClick={discard} disabled={!isDirty || saving} className="ms-ghost-button">Discard changes</button>
          <button type="button" onClick={save} disabled={!isDirty || saving} className="ms-primary-button">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
