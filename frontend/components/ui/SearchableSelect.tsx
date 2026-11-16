'use client'

import { useState, useRef, useEffect, useId } from 'react'

export interface SelectOption {
  value: string
  label: string
  sublabel?: string
}

interface Props {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  dropUp?: boolean
  inlineMenu?: boolean
  className?: string
  style?: React.CSSProperties
  'data-tour'?: string
  'aria-label'?: string
}

export function SearchableSelect({
  options, value, onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  dropUp = false,
  inlineMenu = false,
  className = '',
  style,
  'data-tour': dataTour,
  'aria-label': ariaLabel,
}: Props) {
  const selected = options.find((o) => o.value === value) ?? null
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = search.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        o.sublabel?.toLowerCase().includes(search.toLowerCase())
      )
    : options

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex, listId])

  function close(restoreFocus = false) {
    setOpen(false)
    setSearch('')
    if (restoreFocus) triggerRef.current?.focus()
  }

  function select(val: string) {
    onChange(val)
    close(true)
  }

  function handleOpen() {
    if (open) {
      setOpen(false)
      setSearch('')
      return
    }
    setOpen(true)
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)))
  }

  return (
    <div ref={containerRef} className={`relative ${className}`} data-tour={dataTour}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close() }}
      onKeyDown={(event) => {
        if (!open) {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); handleOpen() }
          return
        }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setActiveIndex((index) => Math.max(0, Math.min(filtered.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))))
        }
        if (event.key === 'Enter' && event.target === inputRef.current) {
          event.preventDefault()
          if (filtered[activeIndex]) select(filtered[activeIndex].value)
        }
      }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ? `${ariaLabel}: ${selected?.label ?? placeholder}` : undefined}
        aria-controls={open ? listId : undefined}
        className="w-full flex items-center justify-between gap-2 rounded-[12px] px-4 py-2.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
        style={{
          border: '1px solid var(--line)',
          background: 'var(--field)',
          color: selected ? 'var(--ink)' : 'var(--muted-2)',
          ...style,
        }}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          className="flex-shrink-0 transition-transform"
          style={{ color: 'var(--muted)', transform: open ? 'rotate(180deg)' : undefined }}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div className={`${inlineMenu ? 'relative mt-2' : 'absolute z-50'} w-full overflow-hidden rounded-[12px] shadow-xl`}
          style={{
            background: 'var(--field)',
            border: '1px solid var(--line)',
            ...(!inlineMenu && (dropUp ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' })),
          }}>
          <div className="flex items-center gap-2 px-3 py-2"
            style={{ borderBottom: '1px solid var(--line-2)' }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
              style={{ color: 'var(--muted)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label={searchPlaceholder}
              aria-expanded={open}
              aria-autocomplete="list"
              aria-controls={listId}
              aria-activedescendant={filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setActiveIndex(0) }}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-xs focus:outline-none"
              style={{ color: 'var(--ink)' }}
            />
            {search && (
              <button type="button" aria-label="Clear option search" onClick={() => { setSearch(''); setActiveIndex(0); inputRef.current?.focus() }}
                className="text-xs flex-shrink-0" style={{ color: 'var(--muted)' }}>✕</button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto" role="listbox" id={listId} aria-label={ariaLabel ?? placeholder}>
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs text-center" style={{ color: 'var(--muted)' }}>No results</p>
            ) : filtered.map((opt, index) => (
              <button key={opt.value} id={`${listId}-${index}`} tabIndex={-1} type="button" role="option" aria-selected={opt.value === value} onMouseDown={(event) => event.preventDefault()} onClick={() => select(opt.value)}
                className="w-full px-4 py-2.5 text-left text-sm transition"
                style={{
                  background: index === activeIndex || opt.value === value ? 'var(--chip)' : undefined,
                  color: opt.value === value ? 'var(--brand)' : 'var(--ink)',
                }}
                onMouseEnter={() => setActiveIndex(index)}>
                <span className="block font-medium truncate">{opt.label}</span>
                {opt.sublabel && (
                  <span className="block text-xs truncate" style={{ color: 'var(--muted)' }}>{opt.sublabel}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
