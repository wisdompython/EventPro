'use client'

import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
import type {
  GuestRequirementPreset,
  RequirementAppliesTo,
  RequirementKind,
} from '@/lib/api'

export interface RequirementSetupDraft {
  client_id: string
  key: string
  label: string
  help_text: string
  kind: RequirementKind
  options: string[]
  unit: string
  required: boolean
  applies_to: RequirementAppliesTo
}

interface Props {
  channel: 'rsvp' | 'preferences'
  questions: RequirementSetupDraft[]
  onChange: (questions: RequirementSetupDraft[]) => void
}

const KIND_LABEL: Record<RequirementKind, string> = {
  boolean: 'Yes / no',
  quantity: 'Quantity',
  choice: 'Pick one',
  multi_choice: 'Pick several',
  text: 'Short answer',
}
const KINDS = Object.keys(KIND_LABEL) as RequirementKind[]
const NEEDS_OPTIONS: RequirementKind[] = ['choice', 'multi_choice']

function clientId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function toKey(label: string) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50)
}

function blankQuestion(): RequirementSetupDraft {
  return {
    client_id: clientId(), key: '', label: '', help_text: '', kind: 'choice',
    options: [''], unit: '', required: false, applies_to: 'everyone',
  }
}

function fromPreset(preset: GuestRequirementPreset): RequirementSetupDraft {
  return {
    client_id: clientId(),
    key: preset.key,
    label: preset.label,
    help_text: preset.help_text,
    kind: preset.kind,
    options: preset.options.length ? [...preset.options] : [''],
    unit: preset.unit,
    required: false,
    applies_to: preset.applies_to,
  }
}

export function NewEventRequirementBuilder({ channel, questions, onChange }: Props) {
  const [presets, setPresets] = useState<GuestRequirementPreset[]>([])
  const [draft, setDraft] = useState<RequirementSetupDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getRequirementPresets().then(setPresets).catch(() => setError('Could not load question suggestions.'))
  }, [])

  function start(question: RequirementSetupDraft, editing: string | null = null) {
    setError('')
    setEditingId(editing)
    setDraft({ ...question, options: [...question.options] })
  }

  function saveDraft() {
    if (!draft) return
    const label = draft.label.trim()
    const key = draft.key || toKey(label)
    if (!label || !key) { setError('Give the question a clear name.'); return }
    if (questions.some((question) => question.client_id !== editingId && question.key === key)) {
      setError('That question has already been added.')
      return
    }
    const options = NEEDS_OPTIONS.includes(draft.kind)
      ? draft.options.map((option) => option.trim()).filter(Boolean)
      : []
    if (NEEDS_OPTIONS.includes(draft.kind) && options.length === 0) {
      setError('Add at least one option for guests to choose from.')
      return
    }
    const saved = {
      ...draft,
      key,
      label,
      help_text: draft.help_text.trim(),
      options,
      unit: draft.kind === 'quantity' ? draft.unit.trim() : '',
    }
    onChange(editingId
      ? questions.map((question) => question.client_id === editingId ? saved : question)
      : [...questions, saved])
    setDraft(null)
    setEditingId(null)
    setError('')
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= questions.length) return
    const next = [...questions]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const usedKeys = new Set(questions.map((question) => question.key))

  return <div className="form-card mt-4">
    <div className="border-b border-[var(--line)] p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-[var(--ink)]">Questions for guests</h3>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        Build meal, dietary, transport and other questions now. They will appear on the {channel === 'rsvp' ? 'RSVP page' : 'standalone preferences form'}.
      </p>
    </div>
    <div className="space-y-4 p-5 sm:p-6">
      {error && <p role="alert" className="rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger)]">{error}</p>}

      {questions.length > 0 && <ul className="space-y-2">
        {questions.map((question, index) => <li key={question.client_id} className="rounded-[14px] border border-[var(--line)] bg-[var(--bg)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-[var(--ink)]">{question.label}</span><span className="rounded-full bg-[var(--chip)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{KIND_LABEL[question.kind]}</span>{question.required && <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--brand)]">Required</span>}</div><p className="mt-1 text-xs text-[var(--muted)]">{question.applies_to === 'everyone' ? 'Every attending guest' : 'Once per invitation'}{question.options.length ? ` · ${question.options.join(', ')}` : ''}{question.unit ? ` · in ${question.unit}` : ''}</p></div>
            <div className="flex items-center gap-1"><button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] disabled:opacity-30">↑</button><button type="button" disabled={index === questions.length - 1} onClick={() => move(index, 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] disabled:opacity-30">↓</button><button type="button" onClick={() => start(question, question.client_id)} className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold">Edit</button><button type="button" onClick={() => onChange(questions.filter((item) => item.client_id !== question.client_id))} className="px-2 py-1.5 text-xs font-semibold text-[var(--danger)]">Delete</button></div>
          </div>
        </li>)}
      </ul>}

      {draft ? <div className="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="form-label" htmlFor="new-req-label">Question</label><input id="new-req-label" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="e.g. Meal choice" className="form-control mt-1.5" /></div>
          <div className="sm:col-span-2"><label className="form-label" htmlFor="new-req-help">Note for guests <span className="font-normal text-[var(--muted)]">(optional)</span></label><input id="new-req-help" value={draft.help_text} onChange={(event) => setDraft({ ...draft, help_text: event.target.value })} placeholder="Shown beneath the question" className="form-control mt-1.5" /></div>
          <div><label className="form-label" htmlFor="new-req-kind">Answer type</label><select id="new-req-kind" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as RequirementKind })} className="form-control mt-1.5">{KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}</select></div>
          <div><label className="form-label" htmlFor="new-req-applies">Who answers</label><select id="new-req-applies" value={draft.applies_to} onChange={(event) => setDraft({ ...draft, applies_to: event.target.value as RequirementAppliesTo })} className="form-control mt-1.5"><option value="everyone">Every attending guest</option><option value="primary">Once per invitation</option></select></div>
          {draft.kind === 'quantity' && <div><label className="form-label" htmlFor="new-req-unit">Measured in</label><input id="new-req-unit" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="yards, nights, seats" className="form-control mt-1.5" /></div>}
          {NEEDS_OPTIONS.includes(draft.kind) && <div className="sm:col-span-2"><span className="form-label">Options</span><div className="mt-1.5 space-y-2">{draft.options.map((option, index) => <div key={index} className="flex gap-2"><input value={option} onChange={(event) => { const options = [...draft.options]; options[index] = event.target.value; setDraft({ ...draft, options }) }} placeholder={`Option ${index + 1}`} className="form-control" /><button type="button" onClick={() => setDraft({ ...draft, options: draft.options.filter((_option, optionIndex) => optionIndex !== index) })} className="rounded-lg border border-[var(--line)] px-3 text-[var(--muted)]">×</button></div>)}</div><button type="button" onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })} className="mt-2 text-xs font-semibold text-[var(--brand)]">+ Add option</button></div>}
          <label className="sm:col-span-2 flex items-start gap-3"><input type="checkbox" checked={draft.required} onChange={(event) => setDraft({ ...draft, required: event.target.checked })} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" /><span><span className="block text-sm font-semibold text-[var(--ink)]">Guests must answer this</span><span className="mt-0.5 block text-xs text-[var(--muted)]">Their submission cannot be completed without it.</span></span></label>
        </div>
        <div className="mt-4 flex gap-2 border-t border-[var(--line)] pt-4"><button type="button" onClick={saveDraft} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-xs font-bold text-white">{editingId ? 'Save changes' : 'Add question'}</button><button type="button" onClick={() => { setDraft(null); setEditingId(null); setError('') }} className="rounded-full border border-[var(--line)] px-5 py-2.5 text-xs font-semibold">Cancel</button></div>
      </div> : <div className="flex flex-wrap gap-2"><button type="button" onClick={() => start(blankQuestion())} className="rounded-full bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white">+ Build a question</button>{presets.filter((preset) => !usedKeys.has(preset.key)).map((preset) => <button key={preset.key} type="button" onClick={() => start(fromPreset(preset))} className="rounded-full border border-[var(--line)] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--brand)]">+ {preset.label}</button>)}</div>}
    </div>
  </div>
}
