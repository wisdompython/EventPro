'use client'

import { FormSectionHeader } from '@/components/ui/FormSectionHeader'

export interface SeatingAreaDraft {
  id: string
  name: string
  prefix: string
  table_count: number
  seats_per_table: number
  shape: 'round' | 'rectangle'
  is_reserved: boolean
}

interface Props {
  step: number
  enabled: boolean
  areas: SeatingAreaDraft[]
  onEnabledChange: (enabled: boolean) => void
  onAreasChange: (areas: SeatingAreaDraft[]) => void
}

const PRESETS: Array<{ name: string; description: string; areas: Omit<SeatingAreaDraft, 'id'>[] }> = [
  {
    name: 'Wedding reception',
    description: 'High table, both families and general guests.',
    areas: [
      { name: 'High table', prefix: 'HT', table_count: 1, seats_per_table: 10, shape: 'rectangle', is_reserved: true },
      { name: "Bride's side", prefix: 'BS', table_count: 4, seats_per_table: 8, shape: 'round', is_reserved: false },
      { name: "Groom's side", prefix: 'GS', table_count: 4, seats_per_table: 8, shape: 'round', is_reserved: false },
      { name: 'Family & VIP', prefix: 'VIP', table_count: 3, seats_per_table: 10, shape: 'round', is_reserved: true },
      { name: 'General guests', prefix: 'GG', table_count: 10, seats_per_table: 8, shape: 'round', is_reserved: false },
    ],
  },
  {
    name: 'Banquet',
    description: 'VIP section plus one main guest area.',
    areas: [
      { name: 'VIP', prefix: 'VIP', table_count: 3, seats_per_table: 10, shape: 'round', is_reserved: true },
      { name: 'Main floor', prefix: 'MF', table_count: 12, seats_per_table: 10, shape: 'round', is_reserved: false },
    ],
  },
]

function uid() {
  return `area-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function SeatingSetupSection({ step, enabled, areas, onEnabledChange, onAreasChange }: Props) {
  const totalTables = areas.reduce((sum, area) => sum + area.table_count, 0)
  const totalSeats = areas.reduce((sum, area) => sum + area.table_count * area.seats_per_table, 0)

  function applyPreset(preset: typeof PRESETS[number]) {
    onEnabledChange(true)
    onAreasChange(preset.areas.map((area) => ({ ...area, id: uid() })))
  }

  function update(id: string, changes: Partial<SeatingAreaDraft>) {
    onAreasChange(areas.map((area) => area.id === id ? { ...area, ...changes } : area))
  }

  return (
    <div className="form-card">
      <FormSectionHeader step={step} title="Set up seating areas" description="Optional: create the room’s guest areas now, or leave this for the Event planner later." />
      <div className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => onEnabledChange(true)} className={`rounded-2xl border p-4 text-left transition ${enabled ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-[var(--line)] bg-white hover:border-[var(--brand)]'}`}>
            <span className="block text-sm font-semibold text-[var(--ink)]">Set up seating now</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">Create named areas, tables and seat capacities with this event.</span>
          </button>
          <button type="button" onClick={() => onEnabledChange(false)} className={`rounded-2xl border p-4 text-left transition ${!enabled ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-[var(--line)] bg-white hover:border-[var(--brand)]'}`}>
            <span className="block text-sm font-semibold text-[var(--ink)]">Configure later</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">Create the event without seating. Guest assignments stay optional.</span>
          </button>
        </div>

        {enabled && <>
          <div>
            <p className="form-label">Start with a layout</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {PRESETS.map((preset) => <button key={preset.name} type="button" onClick={() => applyPreset(preset)} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-left transition hover:border-[var(--brand)]"><strong className="block text-xs text-[var(--ink)]">{preset.name}</strong><span className="mt-1 block text-[11px] leading-4 text-[var(--muted)]">{preset.description}</span></button>)}
              <button type="button" onClick={() => onAreasChange([{ id: uid(), name: '', prefix: '', table_count: 1, seats_per_table: 8, shape: 'round', is_reserved: false }])} className="rounded-xl border border-dashed border-[var(--line)] bg-white px-4 py-3 text-left transition hover:border-[var(--brand)]"><strong className="block text-xs text-[var(--ink)]">Custom layout</strong><span className="mt-1 block text-[11px] leading-4 text-[var(--muted)]">Start with one empty seating area.</span></button>
            </div>
          </div>

          {areas.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-xs text-[var(--muted)]"><strong className="text-[var(--ink)]">{areas.length} areas</strong><span>•</span><span>{totalTables} tables</span><span>•</span><span>{totalSeats} seats planned</span></div>}

          <div className="space-y-3">
            {areas.map((area, index) => <div key={area.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="mb-4 flex items-center justify-between"><div><span className="text-[10px] font-semibold uppercase tracking-[.15em] text-[var(--brand)]">Area {index + 1}</span><p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{area.name || 'New seating area'}</p></div><button type="button" onClick={() => onAreasChange(areas.filter((item) => item.id !== area.id))} className="text-xs font-semibold text-red-600">Remove</button></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2"><label className="form-label">Area name *</label><input value={area.name} onChange={(event) => update(area.id, { name: event.target.value })} required placeholder="e.g. Bride’s side" className="form-control" /></div>
                <div><label className="form-label">Table prefix</label><input value={area.prefix} onChange={(event) => update(area.id, { prefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) })} placeholder="Auto" className="form-control" /></div>
                <div><label className="form-label">Table shape</label><select value={area.shape} onChange={(event) => update(area.id, { shape: event.target.value as SeatingAreaDraft['shape'] })} className="form-control"><option value="round">Round</option><option value="rectangle">Rectangle</option></select></div>
                <div><label className="form-label">Number of tables *</label><input type="number" min={1} max={60} required value={area.table_count} onChange={(event) => update(area.id, { table_count: Number(event.target.value) })} className="form-control" /></div>
                <div><label className="form-label">Seats per table *</label><input type="number" min={1} max={60} required value={area.seats_per_table} onChange={(event) => update(area.id, { seats_per_table: Number(event.target.value) })} className="form-control" /></div>
                <label className="flex items-center gap-2 self-end rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-xs font-semibold text-[var(--ink)] sm:col-span-2"><input type="checkbox" checked={area.is_reserved} onChange={(event) => update(area.id, { is_reserved: event.target.checked })} className="accent-[var(--brand)]" />Priority / reserved area</label>
              </div>
            </div>)}
          </div>

          <button type="button" onClick={() => onAreasChange([...areas, { id: uid(), name: '', prefix: '', table_count: 1, seats_per_table: 8, shape: 'round', is_reserved: false }])} className="w-full rounded-xl border border-dashed border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3 text-sm font-semibold text-[var(--brand)]">+ Add another seating area</button>
          <p className="text-xs leading-5 text-[var(--muted)]">Tables will be labelled from their area prefix—for example, Bride’s side becomes BS-01, BS-02. You can drag and refine the layout later in Event planner.</p>
        </>}
      </div>
    </div>
  )
}
