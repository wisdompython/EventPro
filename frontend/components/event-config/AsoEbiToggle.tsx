"use client"

interface Props {
  enabled: boolean
  /** Organiser wording. Empty string means "use the default". */
  label: string
  unit: string
  onChange: (enabled: boolean) => void
  onLabelChange: (label: string) => void
  onUnitChange: (unit: string) => void
}

export const ASO_EBI_DEFAULT = 'Aso Ebi'
export const ASO_EBI_UNIT_DEFAULT = 'yards'

export function AsoEbiToggle({ enabled, label, unit, onChange, onLabelChange, onUnitChange }: Props) {
  const term = label.trim() || ASO_EBI_DEFAULT
  const unitTerm = unit.trim() || ASO_EBI_UNIT_DEFAULT
  return (
    <div
      className="h-full rounded-[14px] p-4 transition-colors"
      style={{ border: '1px solid var(--line)', background: enabled ? 'var(--brand-soft)' : 'var(--bg)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Collect fabric requests</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Let guests request the event fabric or uniform and state how much they need.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Collect fabric requests"
          onClick={() => onChange(!enabled)}
          className="relative mt-0.5 h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors"
          style={{ background: enabled ? 'var(--brand)' : 'var(--line)' }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
            style={{ left: '2px', transform: enabled ? 'translateX(20px)' : 'translateX(0)' }}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold text-[var(--ink)]" htmlFor="aso-ebi-label">
                What should this be called?
              </label>
              <input
                id="aso-ebi-label"
                value={label}
                onChange={(event) => onLabelChange(event.target.value)}
                placeholder={ASO_EBI_DEFAULT}
                maxLength={40}
                className="form-control mt-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--ink)]" htmlFor="aso-ebi-unit">
                Measured in
              </label>
              <input
                id="aso-ebi-unit"
                value={unit}
                onChange={(event) => onUnitChange(event.target.value)}
                placeholder={ASO_EBI_UNIT_DEFAULT}
                maxLength={20}
                className="form-control mt-1.5 text-sm"
              />
            </div>
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-[var(--muted)]">
            Guests will see &ldquo;{term}&rdquo; and enter a number of {unitTerm}.
          </p>
        </div>
      )}
    </div>
  )
}
