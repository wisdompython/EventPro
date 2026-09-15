'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Event, EventLocation } from '@/lib/api'
import { toWatDateTimeInput, watDateTimeInputToIso } from '@/lib/datetime'
import { DateTimePicker } from '@/components/ui/DateTimePicker'

const field = 'form-control'
const label = 'form-label'

/** How many stops the backend accepts on one event. */
const MAX_LOCATIONS = 10

type Row = {
  key: string
  name: string
  venue: string
  /** WAT wall-clock value for the picker; converted to ISO on submit. */
  startsAt: string
}

function newRow(): Row {
  return { key: Math.random().toString(36).slice(2), name: '', venue: '', startsAt: '' }
}

function rowsFromEvent(locations: EventLocation[] | undefined): Row[] {
  if (!locations?.length) return []
  return locations.map((location) => ({
    key: String(location.id),
    name: location.name,
    venue: location.venue ?? '',
    startsAt: location.starts_at ? toWatDateTimeInput(location.starts_at) : '',
  }))
}

interface Props {
  event?: Event
}

/**
 * Optional schedule for events that happen in more than one place.
 *
 * A wedding runs church then reception; a corporate dinner has one venue and
 * should never be pushed through a repeater. So this stays collapsed until the
 * organiser asks for it, and the event's own Venue and Date fields remain the
 * single-location answer.
 *
 * State is serialised into a hidden input as JSON, so both the add and edit
 * forms pick it up through their existing FormData submit with no changes.
 */
export function EventLocationsField({ event }: Props) {
  const initialRows = useMemo(() => rowsFromEvent(event?.locations), [event?.locations])
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [open, setOpen] = useState(initialRows.length > 0)

  // The edit form loads its event after mount; adopt the schedule when it lands.
  useEffect(() => {
    if (initialRows.length) {
      setRows(initialRows)
      setOpen(true)
    }
  }, [initialRows])

  function update(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function addRow() {
    setRows((current) => (current.length >= MAX_LOCATIONS ? current : [...current, newRow()]))
    setOpen(true)
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key))
  }

  function move(index: number, direction: -1 | 1) {
    setRows((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  // Only submit the field once the organiser has engaged with it. Sending an
  // empty array would clear a schedule the form never showed them.
  const payload = open
    ? JSON.stringify(
        rows.map((row) => ({
          name: row.name.trim(),
          venue: row.venue.trim(),
          starts_at: row.startsAt ? watDateTimeInputToIso(row.startsAt) : null,
        })),
      )
    : ''

  return (
    <div className="sm:col-span-2">
      <input type="hidden" name="locations_setup" value={payload} />

      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Other locations <span className="font-normal text-[var(--muted)]">(optional)</span></p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Add these if your event happens in more than one place — a church service
              and then a reception, for example. Each one can have its own address and
              time, and guests see them in the order you arrange here.
            </p>
          </div>
          {!open && (
            <button type="button" onClick={addRow} className="shrink-0 rounded-full border border-[var(--brand)] px-4 py-2 text-xs font-semibold text-[var(--brand)] transition hover:bg-[var(--brand-soft)]">
              Add another location
            </button>
          )}
        </div>

        {open && (
          <>
            <div className="mt-4 grid gap-3">
              {rows.map((row, index) => (
                <div key={row.key} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted-2)]">
                      Location {index + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0}
                        aria-label={`Move location ${index + 1} up`}
                        className="rounded-md px-2 py-1 text-xs text-[var(--muted)] transition hover:bg-[var(--bg)] disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === rows.length - 1}
                        aria-label={`Move location ${index + 1} down`}
                        className="rounded-md px-2 py-1 text-xs text-[var(--muted)] transition hover:bg-[var(--bg)] disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => removeRow(row.key)}
                        aria-label={`Remove location ${index + 1}`}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--bg)]">Remove</button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={label}>What is it called?</label>
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => update(row.key, { name: e.target.value })}
                        placeholder="e.g. Church"
                        className={field}
                      />
                      <p className="form-hint">The word guests will recognise — Church, Reception, Traditional.</p>
                    </div>

                    <div>
                      <label className={label}>Address</label>
                      <input
                        type="text"
                        value={row.venue}
                        onChange={(e) => update(row.key, { venue: e.target.value })}
                        placeholder="e.g. St Mary's, Ikoyi"
                        className={field}
                      />
                      <p className="form-hint">Where guests should travel to.</p>
                    </div>

                    <div className="sm:col-span-2">
                      <label className={label}>Start time</label>
                      <DateTimePicker
                        id={`location-time-${row.key}`}
                        value={row.startsAt}
                        onChange={(value) => update(row.key, { startsAt: value })}
                      />
                      <p className="form-hint">Leave blank if the time is still to be confirmed.</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={addRow} disabled={rows.length >= MAX_LOCATIONS}
                className="rounded-full border border-[var(--brand)] px-4 py-2 text-xs font-semibold text-[var(--brand)] transition hover:bg-[var(--brand-soft)] disabled:opacity-40">
                Add another location
              </button>
              {rows.length >= MAX_LOCATIONS && (
                <span className="text-xs text-[var(--muted)]">That is the most you can add to one event.</span>
              )}
              {rows.length === 0 && (
                <span className="text-xs text-[var(--muted)]">No extra locations — guests will just see the venue above.</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
