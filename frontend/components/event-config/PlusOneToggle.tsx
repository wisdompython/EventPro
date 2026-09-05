"use client"

interface Props {
  enabled: boolean
  /** Organiser wording. Empty string means "use the default". */
  label: string
  onChange: (enabled: boolean) => void
  onLabelChange: (label: string) => void
}

export const PLUS_ONE_DEFAULT = 'Plus one'

export function PlusOneToggle({ enabled, label, onChange, onLabelChange }: Props) {
  const term = label.trim() || PLUS_ONE_DEFAULT
  return (
    <div
      className="h-full rounded-[14px] p-4 transition-colors"
      style={{ border: '1px solid var(--line)', background: enabled ? 'var(--brand-soft)' : 'var(--bg)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Allow a second guest</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Collect their name and phone number, then send their own QR pass.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Allow a second guest"
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
          <label className="text-[11px] font-semibold text-[var(--ink)]" htmlFor="plus-one-label">
            What should this be called?
          </label>
          <input
            id="plus-one-label"
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
            placeholder={PLUS_ONE_DEFAULT}
            maxLength={40}
            className="form-control mt-1.5 text-sm"
          />
          <p className="mt-1.5 text-[11px] leading-4 text-[var(--muted)]">
            Guests will see &ldquo;{term}&rdquo; on the RSVP page. Try Guest, Partner, or Companion.
          </p>
        </div>
      )}
    </div>
  )
}
