"use client"

import type { GuestRequirementField, RequirementAnswerMap } from '@/lib/api'

interface Props {
  requirements: GuestRequirementField[]
  answers: RequirementAnswerMap
  onChange: (answers: RequirementAnswerMap) => void
  /** Prefix for input ids, so the RSVP and preferences pages do not collide. */
  idPrefix?: string
}

/**
 * Renders whatever questions the planner configured for this event.
 *
 * The shape of each field comes from the server, so a new kind of question is
 * configuration rather than a code change here.
 */
export function RequirementFields({ requirements, answers, onChange, idPrefix = 'req' }: Props) {
  if (!requirements.length) return null

  function set(key: string, value: unknown) {
    onChange({ ...answers, [key]: value })
  }

  return (
    <div className="mt-5 grid gap-4">
      {requirements.map((requirement) => {
        const id = `${idPrefix}-${requirement.key}`
        const value = answers[requirement.key]

        return (
          <div key={requirement.key} className="rounded-[12px] p-4"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>

            {requirement.kind === 'boolean' ? (
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  id={id}
                  type="checkbox"
                  checked={value === true}
                  onChange={(event) => set(requirement.key, event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                />
                <span>
                  <span className="block text-sm font-semibold">{requirement.label}</span>
                  {requirement.help_text && (
                    <span className="mt-1 block text-xs leading-5" style={{ color: 'var(--muted)' }}>
                      {requirement.help_text}
                    </span>
                  )}
                </span>
              </label>
            ) : (
              <>
                <label className="block text-sm font-semibold" htmlFor={id}>
                  {requirement.label}
                  {requirement.required && <span style={{ color: 'var(--brand)' }}> *</span>}
                </label>
                {requirement.help_text && (
                  <p className="mt-1 text-xs leading-5" style={{ color: 'var(--muted)' }}>
                    {requirement.help_text}
                  </p>
                )}

                {requirement.kind === 'quantity' && (
                  <div className="relative mt-2 w-full sm:max-w-[220px]">
                    <input
                      id={id}
                      type="number"
                      min={1}
                      step={1}
                      value={typeof value === 'number' ? value : ''}
                      onChange={(event) => set(
                        requirement.key,
                        event.target.value === '' ? null : Math.max(1, Number(event.target.value) || 1),
                      )}
                      className="form-control pr-16"
                      placeholder="0"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs"
                      style={{ color: 'var(--muted)' }}>
                      {requirement.unit}
                    </span>
                  </div>
                )}

                {requirement.kind === 'choice' && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={requirement.label}>
                    {requirement.options.map((option) => {
                      const selected = value === option
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => set(requirement.key, selected ? null : option)}
                          className="min-h-11 rounded-lg px-3 text-sm font-semibold transition"
                          style={{
                            background: selected ? 'var(--brand)' : 'var(--panel)',
                            border: `1px solid ${selected ? 'var(--brand)' : 'var(--line)'}`,
                            color: selected ? '#fff' : 'var(--ink)',
                          }}
                        >
                          {option}
                        </button>
                      )
                    })}
                  </div>
                )}

                {requirement.kind === 'multi_choice' && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {requirement.options.map((option) => {
                      const chosen = Array.isArray(value) ? value : []
                      const selected = chosen.includes(option)
                      return (
                        <label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm"
                          style={{
                            background: selected ? 'var(--brand-soft)' : 'var(--panel)',
                            border: `1px solid ${selected ? 'var(--brand)' : 'var(--line)'}`,
                          }}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => set(
                              requirement.key,
                              selected ? chosen.filter((item) => item !== option) : [...chosen, option],
                            )}
                            className="h-4 w-4 accent-[var(--brand)]"
                          />
                          <span className="font-semibold">{option}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {requirement.kind === 'text' && (
                  <input
                    id={id}
                    type="text"
                    maxLength={255}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => set(requirement.key, event.target.value)}
                    className="form-control mt-2"
                    placeholder="Your answer"
                  />
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Seed the answer map from what the guest previously said. */
export function initialAnswers(requirements: GuestRequirementField[]): RequirementAnswerMap {
  const answers: RequirementAnswerMap = {}
  for (const requirement of requirements) {
    if (requirement.value !== null && requirement.value !== undefined) {
      answers[requirement.key] = requirement.value
    }
  }
  return answers
}
