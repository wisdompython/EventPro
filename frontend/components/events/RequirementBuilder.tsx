"use client"

import { useCallback, useEffect, useState } from 'react'
import {
  api,
  GuestRequirement,
  GuestRequirementPreset,
  RequirementAppliesTo,
  RequirementCollectOn,
  RequirementKind,
} from '@/lib/api'

const KIND_LABEL: Record<RequirementKind, string> = {
  boolean: 'Yes / no',
  quantity: 'Quantity',
  choice: 'Pick one',
  multi_choice: 'Pick several',
  text: 'Short answer',
}

const KIND_HINT: Record<RequirementKind, string> = {
  boolean: 'Guests tick it or leave it. Good for "do you need a shuttle seat?"',
  quantity: 'Guests enter a number. Good for fabric, nights, or seats.',
  choice: 'Guests pick exactly one option. Good for a meal choice.',
  multi_choice: 'Guests pick any number of options. Good for allergies.',
  text: 'Guests type a short note. Hardest to total up, so use sparingly.',
}

const APPLIES_LABEL: Record<RequirementAppliesTo, string> = {
  primary: 'Once per invitation',
  everyone: 'Every attending guest',
}

const COLLECT_LABEL: Record<RequirementCollectOn, string> = {
  rsvp: 'RSVP page',
  preferences: 'Preferences form',
  both: 'Both',
}

const KINDS: RequirementKind[] = ['boolean', 'quantity', 'choice', 'multi_choice', 'text']
const NEEDS_OPTIONS: RequirementKind[] = ['choice', 'multi_choice']

/** Turn a label into a stable key: "Meal choice" -> "meal_choice". */
function toKey(label: string) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50)
}

interface Draft {
  id?: number
  key: string
  label: string
  help_text: string
  kind: RequirementKind
  options: string[]
  unit: string
  required: boolean
  applies_to: RequirementAppliesTo
  collect_on: RequirementCollectOn
}

const BLANK: Draft = {
  key: '', label: '', help_text: '', kind: 'choice', options: [''], unit: '',
  required: false, applies_to: 'everyone', collect_on: 'both',
}

function fromRequirement(requirement: GuestRequirement): Draft {
  return {
    id: requirement.id,
    key: requirement.key,
    label: requirement.label,
    help_text: requirement.help_text,
    kind: requirement.kind,
    options: requirement.options.length ? requirement.options : [''],
    unit: requirement.unit,
    required: requirement.required,
    applies_to: requirement.applies_to,
    collect_on: requirement.collect_on,
  }
}

interface Props {
  eventId: number
  collectionChannel: 'rsvp' | 'preferences'
}

export function RequirementBuilder({ eventId, collectionChannel }: Props) {
  const [requirements, setRequirements] = useState<GuestRequirement[]>([])
  const [presets, setPresets] = useState<GuestRequirementPreset[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    return api.getRequirements(eventId)
      .then(setRequirements)
      .catch(() => setError('Could not load the questions for this event.'))
  }, [eventId])

  useEffect(() => {
    Promise.all([load(), api.getRequirementPresets().then(setPresets).catch(() => {})])
      .finally(() => setLoading(false))
  }, [load])

  function startPreset(preset: GuestRequirementPreset) {
    setError('')
    setDraft({
      key: preset.key,
      label: preset.label,
      help_text: preset.help_text,
      kind: preset.kind,
      options: preset.options.length ? preset.options : [''],
      unit: preset.unit,
      required: false,
      applies_to: preset.applies_to,
      collect_on: collectionChannel,
    })
  }

  async function save() {
    if (!draft) return
    const label = draft.label.trim()
    if (!label) { setError('Give the question a name.'); return }

    const options = NEEDS_OPTIONS.includes(draft.kind)
      ? draft.options.map((option) => option.trim()).filter(Boolean)
      : []
    if (NEEDS_OPTIONS.includes(draft.kind) && options.length === 0) {
      setError('Add at least one option for guests to choose from.')
      return
    }

    setSaving(true)
    setError('')
    const payload = {
      event: eventId,
      key: draft.key || toKey(label),
      label,
      help_text: draft.help_text.trim(),
      kind: draft.kind,
      options,
      unit: draft.kind === 'quantity' ? draft.unit.trim() : '',
      required: draft.required,
      applies_to: draft.applies_to,
      collect_on: draft.collect_on,
    }

    try {
      if (draft.id) await api.updateRequirement(draft.id, payload)
      else await api.createRequirement(payload)
      await load()
      setDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this question.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(requirement: GuestRequirement) {
    const warning = requirement.response_count > 0
      ? `${requirement.label} has ${requirement.response_count} answer${requirement.response_count === 1 ? '' : 's'}. Deleting it removes them permanently. Continue?`
      : `Delete "${requirement.label}"?`
    if (!confirm(warning)) return
    try {
      await api.deleteRequirement(requirement.id)
      await load()
    } catch {
      setError('Could not delete this question.')
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...requirements]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setRequirements(next)
    try {
      await api.reorderRequirements(eventId, next.map((item) => item.id))
    } catch {
      setError('Could not save the new order.')
      load()
    }
  }

  const usedKeys = new Set(requirements.map((item) => item.key))
  const availablePresets = presets.filter((preset) => !usedKeys.has(preset.key))

  return (
    <div className="form-card">
      <div className="border-b border-[var(--line)] p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-[var(--ink)]">What you need from guests</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          Ask for fabric sizes, meal choices, dietary needs — anything you will need to
          total up and send to a vendor. These answers will be collected on the {collectionChannel === 'rsvp' ? 'RSVP page' : 'standalone preferences form'} and export as a spreadsheet.
        </p>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        {error && (
          <p role="alert" className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-xs text-[var(--muted)]">Loading questions…</p>
        ) : requirements.length === 0 && !draft ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg)] px-4 py-5 text-xs leading-5 text-[var(--muted)]">
            No questions yet. Start from one below, or build your own.
          </p>
        ) : (
          <ul className="space-y-2">
            {requirements.map((requirement, index) => (
              <li key={requirement.id} className="rounded-[14px] border border-[var(--line)] bg-[var(--bg)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--ink)]">{requirement.label}</span>
                      <span className="rounded-full bg-[var(--chip)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                        {KIND_LABEL[requirement.kind]}
                      </span>
                      {requirement.required && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                          Required
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {APPLIES_LABEL[requirement.applies_to]} · asked on {COLLECT_LABEL[requirement.collect_on].toLowerCase()}
                      {requirement.kind === 'quantity' && requirement.unit ? ` · in ${requirement.unit}` : ''}
                      {requirement.options.length ? ` · ${requirement.options.join(', ')}` : ''}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      {requirement.response_count
                        ? `${requirement.response_count} answer${requirement.response_count === 1 ? '' : 's'} so far`
                        : 'No answers yet'}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0}
                      aria-label={`Move ${requirement.label} up`}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === requirements.length - 1}
                      aria-label={`Move ${requirement.label} down`}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => { setError(''); setDraft({ ...fromRequirement(requirement), collect_on: collectionChannel }) }}
                      className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)]">Edit</button>
                    <button type="button" onClick={() => remove(requirement)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ color: 'var(--danger)' }}>Delete</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {draft ? (
          <div className="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="form-label" htmlFor="req-label">Question</label>
                <input id="req-label" className="form-control mt-1.5" value={draft.label}
                  placeholder="e.g. Meal choice"
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
              </div>

              <div className="sm:col-span-2">
                <label className="form-label" htmlFor="req-help">Note for guests <span className="font-normal text-[var(--muted)]">(optional)</span></label>
                <input id="req-help" className="form-control mt-1.5" value={draft.help_text}
                  placeholder="Shown under the question"
                  onChange={(event) => setDraft({ ...draft, help_text: event.target.value })} />
              </div>

              <div>
                <label className="form-label" htmlFor="req-kind">Answer type</label>
                <select id="req-kind" className="form-control mt-1.5" value={draft.kind}
                  onChange={(event) => setDraft({ ...draft, kind: event.target.value as RequirementKind })}>
                  {KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
                </select>
                <p className="form-hint">{KIND_HINT[draft.kind]}</p>
              </div>

              <div>
                <label className="form-label" htmlFor="req-applies">Who answers</label>
                <select id="req-applies" className="form-control mt-1.5" value={draft.applies_to}
                  onChange={(event) => setDraft({ ...draft, applies_to: event.target.value as RequirementAppliesTo })}>
                  <option value="everyone">{APPLIES_LABEL.everyone}</option>
                  <option value="primary">{APPLIES_LABEL.primary}</option>
                </select>
                <p className="form-hint">
                  {draft.applies_to === 'everyone'
                    ? 'A named companion answers for themselves.'
                    : 'Only the invited guest answers; companions are not asked.'}
                </p>
              </div>

              {draft.kind === 'quantity' && (
                <div>
                  <label className="form-label" htmlFor="req-unit">Measured in</label>
                  <input id="req-unit" className="form-control mt-1.5" value={draft.unit}
                    placeholder="yards, nights, seats"
                    onChange={(event) => setDraft({ ...draft, unit: event.target.value })} />
                </div>
              )}

              <div>
                <span className="form-label">Asked on</span>
                <div className="form-control mt-1.5 flex items-center bg-[var(--bg)] text-sm font-semibold text-[var(--ink)]">
                  {COLLECT_LABEL[collectionChannel]}
                </div>
                <p className="form-hint">Controlled by this event’s response workflow.</p>
              </div>

              {NEEDS_OPTIONS.includes(draft.kind) && (
                <div className="sm:col-span-2">
                  <span className="form-label">Options</span>
                  <div className="mt-1.5 space-y-2">
                    {draft.options.map((option, index) => (
                      <div key={index} className="flex gap-2">
                        <input className="form-control" value={option}
                          aria-label={`Option ${index + 1}`}
                          placeholder={`Option ${index + 1}`}
                          onChange={(event) => {
                            const options = [...draft.options]
                            options[index] = event.target.value
                            setDraft({ ...draft, options })
                          }} />
                        <button type="button" aria-label={`Remove option ${index + 1}`}
                          onClick={() => setDraft({ ...draft, options: draft.options.filter((_, i) => i !== index) })}
                          className="shrink-0 rounded-lg border border-[var(--line)] px-3 text-sm text-[var(--muted)]">×</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })}
                    className="mt-2 text-xs font-semibold" style={{ color: 'var(--brand)' }}>+ Add option</button>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={draft.required} className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                    onChange={(event) => setDraft({ ...draft, required: event.target.checked })} />
                  <span>
                    <span className="block text-sm font-semibold text-[var(--ink)]">Guests must answer this</span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      Their {collectionChannel === 'rsvp' ? 'RSVP' : 'preferences form'} will not go through until they do.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
              <button type="button" onClick={save} disabled={saving}
                className="rounded-full px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                style={{ background: 'var(--brand)' }}>
                {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add question'}
              </button>
              <button type="button" onClick={() => { setDraft(null); setError('') }}
                className="rounded-full border border-[var(--line)] px-5 py-2.5 text-xs font-semibold text-[var(--ink)]">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { setError(''); setDraft({ ...BLANK, collect_on: collectionChannel }) }}
              className="rounded-full px-4 py-2 text-xs font-bold text-white" style={{ background: 'var(--brand)' }}>
              + Build a question
            </button>
            {availablePresets.map((preset) => (
              <button key={preset.key} type="button" onClick={() => startPreset(preset)}
                className="rounded-full border border-[var(--line)] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--brand)]">
                + {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
