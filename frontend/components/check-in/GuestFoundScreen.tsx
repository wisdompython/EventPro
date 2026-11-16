'use client'

import { CheckInGuest } from '@/lib/api'

const TICKET_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  vvip:    { bg: 'rgba(168,85,247,0.15)',  color: '#c084fc', border: 'rgba(168,85,247,0.3)' },
  vip:     { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  general: { bg: 'var(--chip)', color: 'var(--muted)', border: 'var(--line)' },
}

export function GuestFoundScreen({
  guest, checkingIn, onConfirm, onCancel, error,
}: {
  guest: CheckInGuest
  checkingIn: boolean
  onConfirm: (target: 'guest' | 'plus_one' | 'both') => void
  onCancel: () => void
  error?: string
}) {
  return (
    <div className="h-full overflow-auto flex flex-col px-4 py-8 max-w-lg mx-auto" style={{ background: 'var(--bg)' }}>
      <div className="flex items-center gap-3 mb-8">
        <button onClick={onCancel} disabled={checkingIn} aria-label="Cancel guest lookup"
          className="w-10 h-10 rounded-sm border flex items-center justify-center transition hover:bg-[var(--bg)]"
          style={{ borderColor: 'var(--line)', color: 'var(--muted)', background: 'var(--panel)' }}>
          ←
        </button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--brand)' }}>Guest Found</p>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Confirm to check in</p>
        </div>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {checkingIn && <p role="status" className="mb-4 text-sm text-[var(--muted)]">Recording check-in. Please wait for confirmation…</p>}
      <div className="bg-[var(--chip)] overflow-hidden mb-6" style={{ border: '1px solid var(--line)', borderRadius: '2px' }}>
        <div className="px-6 py-6 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-1" style={{ color: 'var(--muted-2)' }}>Guest</p>
              <h2 className="font-display text-2xl font-semibold leading-tight" style={{ color: 'var(--ink)' }}>{guest.full_name}</h2>
              {guest.event_name && <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{guest.event_name}</p>}
            </div>
            {(() => { const tc = TICKET_COLORS[guest.ticket_type] ?? TICKET_COLORS.general; return (
              <span className="text-xs font-bold px-3 py-1.5 flex-shrink-0 mt-1"
                style={{ background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
                {guest.ticket_type.toUpperCase()}
              </span>
            )})()}
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y" style={{ borderColor: 'var(--line)' }}>
          {([
            { label: 'Registered', value: new Date(guest.registered_at).toLocaleDateString() },
            { label: 'Area', value: guest.seating_area || '—' },
            { label: 'Table', value: guest.table_number || '—' },
            { label: 'Seat', value: guest.seat_number || '—' },
          ] as ({ label: string; value: string } | null)[]).filter((r): r is { label: string; value: string } => r !== null).map(({ label, value }) => (
            <div key={label} className="px-5 py-4" style={{ borderColor: 'var(--line)' }}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-0.5" style={{ color: 'var(--muted-2)' }}>{label}</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{value}</p>
            </div>
          ))}
          {guest.celebrant_name && <div className="px-5 py-4" style={{ borderColor: 'var(--line)' }}><p className="mb-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-2)]">Celebrant</p><p className="text-sm font-semibold text-[var(--ink)]">{guest.celebrant_name}</p></div>}
          {guest.plus_one_attending && <div className="px-5 py-4" style={{ borderColor: 'var(--line)' }}><p className="mb-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-2)]">Plus one</p><p className="text-sm font-semibold text-[var(--ink)]">{guest.has_named_plus_one ? 'Separate pass and QR' : `Shared pass · ${guest.plus_one_checked_in ? 'checked in' : 'pending'}`}</p></div>}
        </div>
        {guest.service_preferences.length > 0 && (
          <div className="border-t px-5 py-4" style={{ borderColor: 'var(--line)' }}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--brand)' }}>Service information</p>
            <div className="mt-3 grid gap-2">
              {guest.service_preferences.map((preference) => (
                <div key={preference.key} className="flex items-start justify-between gap-4 text-sm">
                  <span style={{ color: 'var(--muted)' }}>{preference.label}</span>
                  <strong className="text-right" style={{ color: 'var(--ink)' }}>{preference.value}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="mb-3 grid w-full gap-2">
        {guest.status !== 'checked_in' && <button onClick={() => onConfirm('guest')} disabled={checkingIn} className="w-full rounded-sm py-4 text-sm font-semibold uppercase tracking-[0.06em] text-white disabled:opacity-60" style={{ background: 'var(--brand)' }}>{checkingIn ? 'Checking in…' : 'Check in guest only'}</button>}
        {guest.plus_one_attending && !guest.has_named_plus_one && !guest.plus_one_checked_in && <button onClick={() => onConfirm('plus_one')} disabled={checkingIn} className="w-full rounded-sm border border-[var(--brand)] py-4 text-sm font-semibold uppercase tracking-[0.06em] text-[var(--brand)] disabled:opacity-60">Check in plus one only</button>}
        {guest.status !== 'checked_in' && guest.plus_one_attending && !guest.has_named_plus_one && !guest.plus_one_checked_in && <button onClick={() => onConfirm('both')} disabled={checkingIn} className="w-full rounded-sm bg-[var(--ink)] py-4 text-sm font-semibold uppercase tracking-[0.06em] text-[var(--bg)] disabled:opacity-60">Check in both</button>}
      </div>
      <button onClick={onCancel} disabled={checkingIn}
        className="w-full font-semibold rounded-sm py-4 text-sm transition-colors"
        style={{ border: '1px solid var(--line)', color: 'var(--muted)', background: 'var(--panel)' }}>
        Cancel
      </button>
    </div>
  )
}
