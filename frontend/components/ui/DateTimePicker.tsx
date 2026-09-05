'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface DateTimePickerProps {
  id?: string
  name?: string
  value: string
  min?: string
  required?: boolean
  dataTour?: string
  onChange: (value: string) => void
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function roundedParts(value?: string, floor?: string) {
  const source = value ? new Date(value) : new Date()
  let minutes = Math.ceil(source.getMinutes() / 5) * 5
  if (minutes === 60) {
    source.setHours(source.getHours() + 1)
    minutes = 0
  }
  source.setMinutes(minutes, 0, 0)

  // Rounding to the nearest 5 minutes can land *below* the caller's minimum
  // (a 10:02 floor rounds the 09:57 clock down to 10:00), which pre-fills the
  // field with a value the form then rejects. Step forward until we clear it.
  if (floor) {
    const limit = new Date(floor)
    if (!Number.isNaN(limit.getTime())) {
      while (source < limit) source.setMinutes(source.getMinutes() + 5)
    }
  }

  const hours24 = source.getHours()
  return {
    date: dateKey(source),
    hour: String(hours24 % 12 || 12),
    minute: pad(source.getMinutes()),
    period: hours24 >= 12 ? 'PM' as const : 'AM' as const,
  }
}

function displayValue(value: string) {
  if (!value) return 'Choose date and time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Choose date and time'
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function DateTimePicker({ id, name, value, min, required, dataTour, onChange }: DateTimePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const initial = roundedParts(value || min, min)
  const [draftDate, setDraftDate] = useState(initial.date)
  const [hour, setHour] = useState(initial.hour)
  const [minute, setMinute] = useState(initial.minute)
  const [period, setPeriod] = useState<'AM' | 'PM'>(initial.period)
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = new Date(`${initial.date}T12:00:00`)
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })
  const [pickerError, setPickerError] = useState('')
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  useEffect(() => {
    if (!value) return
    const parts = roundedParts(value)
    setDraftDate(parts.date)
    setHour(parts.hour)
    setMinute(parts.minute)
    setPeriod(parts.period)
    const date = new Date(`${parts.date}T12:00:00`)
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1))
  }, [value])

  const calendarDays = useMemo(() => {
    const firstGridDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - visibleMonth.getDay())
    // Render only the weeks this month actually occupies. A fixed 6-week grid
    // adds a row of trailing greyed-out dates that makes the panel taller than
    // the viewport for no benefit.
    const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate()
    const weeks = Math.ceil((visibleMonth.getDay() + daysInMonth) / 7)
    return Array.from({ length: weeks * 7 }, (_, index) => {
      const day = new Date(firstGridDay)
      day.setDate(firstGridDay.getDate() + index)
      return day
    })
  }, [visibleMonth])


  const minimumDay = min?.slice(0, 10)
  const today = dateKey(new Date())

  function openPicker() {
    if (!value) {
      const parts = roundedParts(min, min)
      setDraftDate(parts.date)
      setHour(parts.hour)
      setMinute(parts.minute)
      setPeriod(parts.period)
      const date = new Date(`${parts.date}T12:00:00`)
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1))
    }
    setPickerError('')
    setOpen(true)
  }

  function applySelection() {
    let hours = Number(hour) % 12
    if (period === 'PM') hours += 12
    const nextValue = `${draftDate}T${pad(hours)}:${minute}`
    if (min && nextValue < min) {
      setPickerError('Choose a time later than the current minimum.')
      return
    }
    onChange(nextValue)
    setPickerError('')
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      {name && <input type="hidden" name={name} value={value} />}
      <button
        id={id}
        type="button"
        data-tour={dataTour}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={required ? 'Choose required event date and time' : 'Choose event date and time'}
        onClick={() => open ? setOpen(false) : openPicker()}
        className={`form-control flex min-h-[52px] w-full items-center justify-between gap-3 text-left transition ${open ? 'border-[var(--brand)] ring-4 ring-[var(--brand-soft)]' : ''}`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
          </span>
          <span className={`truncate text-sm ${value ? 'font-semibold text-[var(--ink)]' : 'text-[var(--muted)]'}`}>{displayValue(value)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-[var(--brand-soft)] px-2 py-1 text-[10px] font-bold tracking-wide text-[var(--brand)]">WAT</span>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" className={`text-[var(--muted)] transition ${open ? 'rotate-180' : ''}`} aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>
        </span>
      </button>

      {open && mounted && createPortal(
        // The picker is always a centred modal.
        //
        // It used to open as a popover anchored to the field and then measure
        // itself to decide whether to flip or fall back to a modal. That is a
        // frame too late: the first paint is the clipped popover, which is the
        // flicker-then-adjust people saw, and on a viewport with no room it
        // simply stayed cut off. Centring in a flex overlay lets the browser do
        // the fitting in one pass - no measurement, no placement state, and no
        // intermediate frame that can be wrong.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain p-3 sm:p-6"
          onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}
        >
          <div className="absolute inset-0 bg-[rgba(23,21,34,0.45)]" aria-hidden="true" />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Choose date and time"
            // max-height is expressed in CSS, so it is correct on first paint
            // and stays correct when the viewport or keyboard changes.
            className="relative z-10 flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_24px_70px_rgba(31,24,74,0.22)]">

        <div className="flex flex-none items-center justify-between border-b border-[var(--line)] bg-[var(--brand-soft)] px-4 py-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand)]">Event schedule</p><p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{displayValue(`${draftDate}T${period === 'PM' ? pad((Number(hour) % 12) + 12) : pad(Number(hour) % 12)}:${minute}`)}</p></div>
          <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] transition hover:text-[var(--ink)]" aria-label="Close date picker">×</button>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto"><div className="grid sm:grid-cols-[1fr_220px]">
          <div className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <button type="button" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] text-[var(--ink)] transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]" aria-label="Previous month">←</button>
              <p className="text-sm font-bold text-[var(--ink)]">{visibleMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
              <button type="button" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] text-[var(--ink)] transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]" aria-label="Next month">→</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((day) => <span key={day} className="py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{day}</span>)}
              {calendarDays.map((day) => {
                const key = dateKey(day)
                const outsideMonth = day.getMonth() !== visibleMonth.getMonth()
                const disabled = Boolean(minimumDay && key < minimumDay)
                const selected = key === draftDate
                return <button key={key} type="button" disabled={disabled} onClick={() => { setDraftDate(key); setPickerError('') }} aria-pressed={selected} aria-label={day.toLocaleDateString('en-GB', { dateStyle: 'full' })} className={`relative aspect-square max-h-[44px] rounded-xl text-xs font-semibold transition ${selected ? 'bg-[var(--brand)] text-white shadow-[0_7px_18px_rgba(103,87,217,0.28)]' : disabled ? 'cursor-not-allowed text-[var(--line)]' : outsideMonth ? 'text-[var(--muted-2)] hover:bg-[var(--brand-soft)]' : 'text-[var(--ink)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]'}`}>{day.getDate()}{key === today && !selected && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--brand)]"/>}</button>
              })}
            </div>
          </div>

          <div className="border-t border-[var(--line)] bg-[var(--bg)] p-4 sm:border-l sm:border-t-0 sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Time</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Hour<select value={hour} onChange={(event) => setHour(event.target.value)} className="form-control mt-1.5 bg-[var(--panel)] text-sm font-semibold">{Array.from({ length: 12 }, (_, index) => String(index + 1)).map((item) => <option key={item} value={item}>{pad(Number(item))}</option>)}</select></label>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Minute<select value={minute} onChange={(event) => setMinute(event.target.value)} className="form-control mt-1.5 bg-[var(--panel)] text-sm font-semibold">{MINUTES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            </div>
            <div className="mt-3 grid grid-cols-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1">
              {(['AM', 'PM'] as const).map((item) => <button key={item} type="button" onClick={() => setPeriod(item)} className={`rounded-lg py-2 text-xs font-bold transition ${period === item ? 'bg-[var(--brand)] text-white shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>{item}</button>)}
            </div>
            <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--brand)]">West Africa Time</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">UTC+1 · used for invitations, passes and reminders.</p></div>
          </div>

        {pickerError && <p role="alert" className="mx-4 mb-3 flex-none rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger)] sm:mx-5">{pickerError}</p>}
        </div></div>

        <div className="flex flex-none items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-3 sm:px-5">
          <button type="button" onClick={() => { onChange(''); setPickerError(''); setOpen(false) }} className="px-3 py-2 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--ink)]">Clear</button>
          <button type="button" onClick={applySelection} className="rounded-full bg-[var(--brand)] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[var(--brand-strong)]">Apply date &amp; time</button>
        </div>
          </div>
        </div>,
        // `position: fixed` resolves against the nearest ancestor that creates
        // a containing block (any transform/filter/will-change on a parent),
        // which pinned the overlay to the form card instead of the viewport.
        // Portalling to <body> avoids that entirely.
        document.body,
      )}
    </div>
  )
}
