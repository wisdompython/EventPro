'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { api, Event, PreferenceDashboard, PreferenceGuest, PreferenceSeatingTable } from '@/lib/api'
import './preferences.css'

/** Answers a caterer or vendor needs are read in two ways: as a total to
 *  order against, and as one guest's row to check a specific request. The page
 *  shows both, from a single fetch, so the two can never disagree. */
type AnsweredFilter = '' | 'yes' | 'no'
type EventScope = 'all' | 'upcoming' | 'past'
type DashboardView = 'overview' | 'tables' | 'guests'

const MEAL_WORDS = /\b(meal|menu|food|dish|main course|protein|soup|swallow)\b/i

function isMealQuestion(question: { key?: string; label: string }) {
  return MEAL_WORDS.test(`${question.key ?? ''} ${question.label}`)
}

function completeMealLabel(values: string[]) {
  const selections = values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.findIndex((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase()) === index)

  if (selections.length < 2) return selections[0] ?? ''
  if (selections.length === 2) return `${selections[0]} with ${selections[1]}`
  return `${selections[0]} with ${selections.slice(1, -1).join(', ')} and ${selections.at(-1)}`
}

/** Table service must count plates, not isolated components. A guest who chose
 *  jollof rice, chicken and beef therefore contributes one complete meal. */
function getMealOrders(table: PreferenceSeatingTable) {
  const counts = new Map<string, { label: string; count: number }>()
  for (const guest of table.guests) {
    const label = completeMealLabel(
      guest.answers.filter(isMealQuestion).map((answer) => answer.value),
    )
    if (!label) continue
    const key = label.toLocaleLowerCase()
    const current = counts.get(key)
    if (current) current.count += 1
    else counts.set(key, { label, count: 1 })
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function formatDate(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function formatEventDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

function eventTiming(event: Event) {
  const eventDate = new Date(event.date)
  const now = new Date()
  const sameDay = eventDate.getFullYear() === now.getFullYear()
    && eventDate.getMonth() === now.getMonth()
    && eventDate.getDate() === now.getDate()
  if (sameDay && !event.is_ended) return { label: 'Today', tone: 'live' }
  if (event.is_ended || eventDate.getTime() < now.getTime()) return { label: 'Past event', tone: 'past' }
  return { label: 'Upcoming', tone: 'upcoming' }
}

function questionKindLabel(kind: string) {
  return ({
    choice: 'Single choice',
    multi_choice: 'Multiple choice',
    quantity: 'Quantity',
    boolean: 'Yes or no',
    text: 'Written answer',
  } as Record<string, string>)[kind] ?? kind.replaceAll('_', ' ')
}

type CsvCell = string | number

function downloadCsv(filename: string, rows: CsvCell[][]) {
  const escape = (cell: CsvCell) => {
    const value = String(cell)
    return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
  }
  const csv = rows.map((row) => row.map(escape).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, filename)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportName(name: string) {
  return name.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

export default function PreferencesPage() {
  const router = useRouter()
  const pathname = usePathname()
  const pathEventId = Number(pathname.match(/^\/admin\/preferences\/(\d+)\/?$/)?.[1] ?? 0)
  const [events, setEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)

  const [data, setData] = useState<PreferenceDashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [answered, setAnswered] = useState<AnsweredFilter>('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [eventSearch, setEventSearch] = useState('')
  const [eventScope, setEventScope] = useState<EventScope>('all')
  const [exporting, setExporting] = useState('')
  const [serviceTableIndex, setServiceTableIndex] = useState<number | null>(null)
  const [dashboardView, setDashboardView] = useState<DashboardView>('overview')

  useEffect(() => {
    setEventsLoading(true)
    api.getEvents()
      .then((items) => {
        setEvents(items)
        const legacyEventId = Number(new URLSearchParams(window.location.search).get('event'))
        const requested = pathEventId || legacyEventId
        setSelectedEvent(requested ? items.find((item) => item.id === requested) ?? null : null)
        if (!pathEventId && legacyEventId) {
          router.replace(`/admin/preferences/${legacyEventId}`)
        }
      })
      .catch(() => setError('Could not load your events.'))
      .finally(() => setEventsLoading(false))
  }, [pathEventId, router])

  const load = useCallback((eventId: number, term: string, filter: AnsweredFilter) => {
    setLoading(true)
    api.getPreferenceDashboard(eventId, { search: term, answered: filter })
      .then(setData)
      .catch(() => setError('Could not load preferences for this event.'))
      .finally(() => setLoading(false))
  }, [])

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    if (!selectedEvent) return
    const timer = setTimeout(() => load(selectedEvent.id, search, answered), 250)
    return () => clearTimeout(timer)
  }, [selectedEvent, search, answered, load])

  // Door scans update table arrival counts without requiring catering staff to
  // refresh or operate a separate service screen.
  useEffect(() => {
    if (!selectedEvent || !data) return
    const timer = window.setInterval(() => {
      api.getPreferenceDashboard(selectedEvent.id, { search, answered })
        .then(setData)
        .catch(() => {})
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [selectedEvent, data, search, answered])

  useEffect(() => {
    if (serviceTableIndex === null) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setServiceTableIndex(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [serviceTableIndex])

  const responseRate = useMemo(() => {
    if (!data || !data.summary.total) return 0
    return Math.round((data.summary.submitted / data.summary.total) * 100)
  }, [data])

  const eventCounts = useMemo(() => ({
    all: events.length,
    upcoming: events.filter((event) => eventTiming(event).tone !== 'past').length,
    past: events.filter((event) => eventTiming(event).tone === 'past').length,
  }), [events])

  const seatingGroups = useMemo(() => {
    const groups = new Map<string, PreferenceSeatingTable[]>()
    for (const table of data?.seating ?? []) {
      const group = groups.get(table.section_name) ?? []
      group.push(table)
      groups.set(table.section_name, group)
    }
    return Array.from(groups, ([name, tables]) => ({ name, tables }))
  }, [data])

  const visibleEvents = useMemo(() => {
    const term = eventSearch.trim().toLowerCase()
    return events
      .filter((event) => {
        const timing = eventTiming(event)
        if (eventScope === 'upcoming' && timing.tone === 'past') return false
        if (eventScope === 'past' && timing.tone !== 'past') return false
        return !term || event.name.toLowerCase().includes(term)
          || event.venue.toLowerCase().includes(term)
          || String(event.id).includes(term.replace(/^#/, ''))
      })
      .sort((a, b) => {
        const aPast = eventTiming(a).tone === 'past'
        const bPast = eventTiming(b).tone === 'past'
        if (aPast !== bPast) return aPast ? 1 : -1
        return aPast
          ? new Date(b.date).getTime() - new Date(a.date).getTime()
          : new Date(a.date).getTime() - new Date(b.date).getTime()
      })
  }, [events, eventSearch, eventScope])

  function exportResponsesCsv() {
    if (!data || !selectedEvent) return
    // Built client-side from what is already on screen, so the file always
    // matches the filters the planner can see.
    const headers = [
      'Guest', 'Phone', 'Ticket', 'Table', 'Submitted',
      ...data.columns.map((column) => column.label),
      ...(data.legacy.aso_ebi_superseded ? [] : ['Aso Ebi']),
      'Plus one',
    ]
    const rows = data.guests.map((guest) => {
      const byKey = new Map(guest.answers.map((answer) => [answer.key, answer.value]))
      return [
        guest.full_name,
        guest.phone_number,
        guest.ticket_type,
        guest.table_number,
        guest.submitted_at ? new Date(guest.submitted_at).toISOString() : '',
        ...data.columns.map((column) => byKey.get(column.key) ?? ''),
        ...(data.legacy.aso_ebi_superseded
          ? []
          : [guest.aso_ebi_requested ? `${guest.aso_ebi_quantity}` : '']),
        guest.plus_one_attending ? 'Yes' : '',
      ]
    })
    downloadCsv(`${exportName(selectedEvent.name)}-guest-responses.csv`, [headers, ...rows])
  }

  function exportSupplierSummaryCsv() {
    if (!data || !selectedEvent) return
    const rows: CsvCell[][] = [[
      'Question', 'Response type', 'Option or total', 'Count', 'Unit', 'Guests answered',
    ]]

    for (const question of data.questions) {
      if (question.kind === 'quantity') {
        rows.push([
          question.label, 'Quantity', 'Total requested', question.total ?? 0,
          question.unit, question.answered,
        ])
      } else if (question.breakdown.length > 0) {
        for (const option of question.breakdown) {
          rows.push([
            question.label, questionKindLabel(question.kind), option.label,
            option.count, '', question.answered,
          ])
        }
      } else {
        rows.push([
          question.label, questionKindLabel(question.kind), 'Written responses',
          question.answered, '', question.answered,
        ])
      }
    }

    if (!data.legacy.aso_ebi_superseded) {
      rows.push([
        'Aso Ebi', 'Quantity', 'Total requested', data.legacy.aso_ebi_quantity,
        'yards', data.legacy.aso_ebi_guests,
      ])
    }
    rows.push([
      'Plus ones', 'Attendance', 'Extra covers', data.legacy.plus_ones,
      'people', data.legacy.plus_ones,
    ])

    if (data.seating.length > 0) {
      rows.push([])
      rows.push(['TABLE SERVICE PLAN'])
      rows.push(['Section', 'Table', 'Question', 'Option or total', 'Count', 'Unit'])
      for (const table of data.seating) {
        for (const order of getMealOrders(table)) {
          rows.push([
            table.section_name, table.table_label, 'Complete meal',
            order.label, order.count, '',
          ])
        }
        for (const question of table.totals.filter((item) => !isMealQuestion(item))) {
          if (question.kind === 'quantity') {
            rows.push([
              table.section_name, table.table_label, question.label,
              'Total requested', question.total ?? 0, question.unit,
            ])
          } else if (question.breakdown.length > 0) {
            for (const option of question.breakdown) {
              rows.push([
                table.section_name, table.table_label, question.label,
                option.label, option.count, '',
              ])
            }
          } else {
            rows.push([
              table.section_name, table.table_label, question.label,
              'Written responses', question.answered, '',
            ])
          }
        }
      }

      rows.push([])
      rows.push(['SEAT-BY-SEAT SERVICE LIST'])
      rows.push(['Section', 'Table', 'Seat', 'Guest', 'Arrival', 'Preferences'])
      for (const table of data.seating) {
        for (const guest of table.guests) {
          rows.push([
            table.section_name,
            table.table_label,
            guest.seat_number || 'Not assigned',
            guest.full_name,
            guest.checked_in ? 'Checked in' : 'Not arrived',
            guest.answers.map((answer) => `${answer.label}: ${answer.value}`).join('; ') || 'Pending',
          ])
        }
      }
    }

    downloadCsv(`${exportName(selectedEvent.name)}-supplier-summary.csv`, rows)
  }

  async function exportServicePackPdf(targetTable?: PreferenceSeatingTable, tableIndex?: number) {
    if (!data || !selectedEvent) return
    const exportKey = targetTable ? `table-pdf-${tableIndex}` : 'pdf'
    setExporting(exportKey)
    setError('')
    try {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 15
      const purple = [103, 87, 217] as const
      const ink = [33, 29, 43] as const
      const muted = [118, 111, 126] as const
      const orange = [238, 118, 81] as const

      const pageHeader = (eyebrow: string, title: string, subtitle: string) => {
        pdf.setFillColor(23, 21, 34)
        pdf.rect(0, 0, pageWidth, 42, 'F')
        pdf.setFillColor(...orange)
        pdf.rect(0, 0, 5, 42, 'F')
        pdf.setTextColor(190, 180, 239)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7)
        pdf.text(eyebrow.toUpperCase(), margin, 13)
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(20)
        pdf.text(title, margin, 24)
        pdf.setTextColor(176, 169, 186)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)
        pdf.text(subtitle, margin, 33)
      }

      const addQuestionRows = (
        questions: PreferenceDashboard['questions'], x: number, startY: number, width: number,
      ) => {
        let y = startY
        for (const question of questions) {
          pdf.setTextColor(...ink)
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(9)
          pdf.text(question.label, x, y)
          y += 5
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(8)
          pdf.setTextColor(...muted)
          const value = question.kind === 'quantity'
            ? `${question.total ?? 0} ${question.unit}`
            : question.breakdown.length
              ? question.breakdown.map((row) => `${row.label}: ${row.count}`).join('  |  ')
              : `${question.answered} written response${question.answered === 1 ? '' : 's'}`
          const lines = pdf.splitTextToSize(value, width)
          pdf.text(lines, x, y)
          y += lines.length * 4 + 6
        }
        return y
      }

      if (!targetTable) {
        pageHeader(
          'Event Pro catering service pack',
          selectedEvent.name,
          `${formatEventDate(selectedEvent.date)}${selectedEvent.venue ? ` - ${selectedEvent.venue}` : ''}`,
        )
        pdf.setTextColor(...ink)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(13)
        pdf.text('Kitchen production totals', margin, 57)
        pdf.setDrawColor(220, 216, 226)
        pdf.line(margin, 61, pageWidth - margin, 61)
        addQuestionRows(data.questions, margin, 70, pageWidth - margin * 2)
      }

      const tables = targetTable ? [targetTable] : data.seating
      for (const [currentTableIndex, table] of tables.entries()) {
        if (!targetTable || currentTableIndex > 0) pdf.addPage('a4', 'landscape')
        const tableSubtitle = `${table.guest_count}${table.seats ? ` of ${table.seats}` : ''} guests - ${table.checked_in_count} checked in - ${table.responded_count} preferences received`
        pageHeader(table.section_name, table.table_label, tableSubtitle)

        const mealOrders = getMealOrders(table)
        pdf.setTextColor(...purple)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.text('COMPLETE MEAL ORDERS', margin, 56)
        let tableSummaryY = 66
        pdf.setFontSize(8.5)
        if (mealOrders.length) {
          for (const order of mealOrders) {
            const lines = pdf.splitTextToSize(`${order.count} x ${order.label}`, 76)
            pdf.setTextColor(...ink)
            pdf.text(lines, margin, tableSummaryY)
            tableSummaryY += lines.length * 4 + 3
          }
        } else {
          pdf.setTextColor(...muted)
          pdf.setFont('helvetica', 'normal')
          pdf.text('No meal selections received', margin, tableSummaryY)
          tableSummaryY += 8
        }

        const otherTotals = table.totals.filter((question) => !isMealQuestion(question))
        if (otherTotals.length) {
          pdf.setTextColor(...purple)
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(9)
          pdf.text('OTHER REQUIREMENTS', margin, tableSummaryY + 3)
          addQuestionRows(otherTotals, margin, tableSummaryY + 11, 76)
        }

        const guestX = 105
        const guestWidth = pageWidth - guestX - margin
        pdf.setTextColor(...purple)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(12)
        pdf.text('GUEST PREFERENCES - SERVE BY NAME', guestX, 56)
        let guestY = 62
        let guestCardX = guestX
        let guestCardWidth = guestWidth
        for (const guest of table.guests) {
          const answerLayouts = guest.answers.map((answer) => ({
            answer,
            lines: pdf.splitTextToSize(answer.value, guestWidth - 52),
          }))
          const answerHeight = answerLayouts.length
            ? answerLayouts.reduce((height, layout) => height + Math.max(4.2, layout.lines.length * 3.6), 0)
            : 5
          const cardHeight = 13 + answerHeight

          if (guestY + cardHeight > pageHeight - 15) {
            pdf.addPage('a4', 'landscape')
            pageHeader(table.section_name, `${table.table_label} - continued`, tableSubtitle)
            pdf.setTextColor(...purple)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(12)
            pdf.text('GUEST PREFERENCES - SERVE BY NAME', margin, 56)
            guestY = 62
            guestCardX = margin
            guestCardWidth = pageWidth - margin * 2
          }

          pdf.setFillColor(249, 248, 251)
          pdf.setDrawColor(224, 220, 229)
          pdf.roundedRect(guestCardX, guestY, guestCardWidth, cardHeight, 2, 2, 'FD')

          const seat = guest.seat_number ? `Seat ${guest.seat_number}` : 'Seat not assigned'
          pdf.setTextColor(...ink)
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(9.5)
          pdf.text(`${seat} - ${guest.full_name}`, guestCardX + 4, guestY + 7)

          const statusLabel = guest.checked_in ? 'ARRIVED' : 'NOT ARRIVED'
          const statusWidth = pdf.getTextWidth(statusLabel) + 7
          if (guest.checked_in) pdf.setFillColor(25, 150, 111)
          else pdf.setFillColor(132, 124, 142)
          pdf.roundedRect(guestCardX + guestCardWidth - statusWidth - 4, guestY + 3, statusWidth, 6, 2, 2, 'F')
          pdf.setTextColor(255, 255, 255)
          pdf.setFontSize(6.2)
          pdf.text(statusLabel, guestCardX + guestCardWidth - statusWidth - 0.5, guestY + 7)

          let answerY = guestY + 13
          if (answerLayouts.length) {
            for (const { answer, lines } of answerLayouts) {
              pdf.setTextColor(...orange)
              pdf.setFont('helvetica', 'bold')
              pdf.setFontSize(7.4)
              pdf.text(`${answer.label.toUpperCase()}:`, guestCardX + 4, answerY)
              pdf.setTextColor(...ink)
              pdf.setFontSize(8.4)
              pdf.text(lines, guestCardX + 46, answerY)
              answerY += Math.max(4.2, lines.length * 3.6)
            }
          } else {
            pdf.setTextColor(202, 84, 52)
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(8)
            pdf.text('PREFERENCES PENDING', guestCardX + 4, answerY)
          }
          guestY += cardHeight + 3
        }
      }

      const pageCount = pdf.getNumberOfPages()
      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page)
        pdf.setTextColor(145, 138, 153)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(7)
        pdf.text('Event Pro - supplier copy', margin, pageHeight - 8)
        pdf.text(`${page} / ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
      }
      pdf.setProperties({
        title: `${selectedEvent.name} catering service pack`,
        subject: 'Kitchen totals, table service cards, and seat-by-seat preferences',
        creator: 'Event Pro',
      })
      const filename = targetTable
        ? `${exportName(selectedEvent.name)}-${exportName(targetTable.table_label)}-waiter-card.pdf`
        : `${exportName(selectedEvent.name)}-catering-service-pack.pdf`
      pdf.save(filename)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the catering PDF.')
    } finally {
      setExporting('')
    }
  }

  async function exportTablePng(table: PreferenceSeatingTable, index: number) {
    const source = document.getElementById(`pref-service-modal-panel-${index}`)
    if (!source || !selectedEvent) return
    setExporting(`table-${index}`)
    setError('')
    try {
      source.classList.add('is-exporting')
      const { toBlob } = await import('html-to-image')
      const blob = await toBlob(source, {
        backgroundColor: '#f7f5fa',
        pixelRatio: 2,
        cacheBust: true,
      })
      if (!blob) throw new Error('The table image could not be created.')
      downloadBlob(blob, `${exportName(selectedEvent.name)}-${exportName(table.table_label)}.png`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the table image.')
    } finally {
      source.classList.remove('is-exporting')
      setExporting('')
    }
  }

  // ── Event picker ──────────────────────────────────────────────────────────
  if (!selectedEvent) {
    return (
      <div className="admin-page pref-picker-page">
        <div className="admin-page__header pref-picker-header">
          <div className="admin-page__identity">
            <p className="admin-page__eyebrow">Guest intelligence</p>
            <h1 className="admin-page__title">Preference centre</h1>
            <p className="admin-page__description">
              Open an event to review meal choices, dietary needs and every response
              your vendors need to deliver the right experience.
            </p>
          </div>
          {!eventsLoading && events.length > 0 && (
            <div className="pref-picker-overview" aria-label="Event overview">
              <div><strong>{events.length}</strong><span>Events</span></div>
              <div><strong>{eventCounts.upcoming}</strong><span>Active</span></div>
              <div><strong>{events.reduce((total, event) => total + event.preferences_submitted_count, 0)}</strong><span>Responses</span></div>
            </div>
          )}
        </div>

        {eventsLoading ? (
          <div className="pref-picker-loading" aria-live="polite">
            <i />
            <p>Loading event preferences…</p>
          </div>
        ) : events.length === 0 ? (
          <p className="pref-empty">No events yet. Create one first.</p>
        ) : (
          <section className="pref-picker-shell">
            <div className="pref-picker-toolbar">
              <label className="pref-event-search">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" />
                </svg>
                <input
                  type="search"
                  value={eventSearch}
                  onChange={(event) => setEventSearch(event.target.value)}
                  placeholder="Search event, venue or ID…"
                  aria-label="Search events"
                />
              </label>
              <div className="pref-event-scopes" role="group" aria-label="Filter events">
                {([
                  ['all', 'All', eventCounts.all],
                  ['upcoming', 'Active', eventCounts.upcoming],
                  ['past', 'Past', eventCounts.past],
                ] as Array<[EventScope, string, number]>).map(([value, label, count]) => (
                  <button
                    key={value}
                    className={eventScope === value ? 'is-active' : ''}
                    onClick={() => setEventScope(value)}
                    aria-pressed={eventScope === value}
                  >
                    {label}<span>{count}</span>
                  </button>
                ))}
              </div>
            </div>

            {visibleEvents.length === 0 ? (
              <div className="pref-picker-no-results">
                <strong>No matching events</strong>
                <p>Try another name, venue, or event ID.</p>
                <button onClick={() => { setEventSearch(''); setEventScope('all') }}>Clear filters</button>
              </div>
            ) : (
              <div className="pref-event-grid">
                {visibleEvents.map((event) => {
                  const timing = eventTiming(event)
                  const submitted = event.preferences_submitted_count || 0
                  const total = event.guest_count || 0
                  const progress = total ? Math.min(100, Math.round((submitted / total) * 100)) : 0
                  const date = new Date(event.date)
                  return (
                    <button
                      key={event.id}
                      className="pref-event-card"
                      onClick={() => {
                        setSelectedEvent(event)
                        setDashboardView('overview')
                        router.push(`/admin/preferences/${event.id}`)
                      }}
                    >
                      <span className="pref-event-card__accent" aria-hidden="true" />
                      <span className="pref-event-card__topline">
                        <span className="pref-event-id">Event #{event.id}</span>
                        <span className={`pref-event-status is-${timing.tone}`}><i />{timing.label}</span>
                      </span>
                      <span className="pref-event-card__body">
                        <span className="pref-event-date" aria-hidden="true">
                          <b>{date.toLocaleDateString('en-GB', { day: '2-digit' })}</b>
                          <small>{date.toLocaleDateString('en-GB', { month: 'short' })}</small>
                        </span>
                        <span className="pref-event-card__identity">
                          <strong>{event.name}</strong>
                          <span>{formatEventDate(event.date)}</span>
                          <span className="pref-event-venue">{event.venue || 'Venue not added'}</span>
                        </span>
                      </span>
                      <span className="pref-event-card__progress">
                        <span><b>{submitted}</b> of {total} guest responses</span>
                        <span>{progress}%</span>
                        <i><b style={{ width: `${progress}%` }} /></i>
                      </span>
                      <span className="pref-event-card__footer">
                        <span>{event.preferences_enabled ? 'Collecting preferences' : 'Preference collection off'}</span>
                        <strong>Open dashboard <i aria-hidden="true">→</i></strong>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="admin-page pref-dashboard-page">
      <section className="pref-dashboard-hero">
        <div className="pref-dashboard-hero__identity">
          <p className="pref-dashboard-hero__eyebrow"><span /> Preference dashboard</p>
          <div className="pref-dashboard-hero__meta" aria-label="Selected event details">
            <span className="pref-dashboard-event-id">Event #{selectedEvent.id}</span>
            <span>{formatEventDate(selectedEvent.date)}</span>
            {selectedEvent.venue && <span>{selectedEvent.venue}</span>}
          </div>
          <h1>{selectedEvent.name}</h1>
          <p>One clear view of what guests requested and what your vendors need to prepare.</p>
        </div>
        <div className="pref-dashboard-hero__actions">
          <button
            className="pref-hero-action"
            onClick={() => {
              setSelectedEvent(null)
              setData(null)
              setDashboardView('overview')
              router.push('/admin/preferences')
            }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m9 18-6-6 6-6" /><path d="M3 12h18" />
            </svg>
            All events
          </button>
        </div>
      </section>

      {error && (
        <div className="pref-alert" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label="Dismiss">×</button>
        </div>
      )}

      {data && (
        <>
          <section className="pref-dashboard-nav" aria-label="Preference dashboard views">
            <div className="pref-view-tabs" role="tablist" aria-label="Choose dashboard view">
              {([
                ['overview', 'Overview', `${data.questions.length} totals`],
                ['tables', 'Table service', `${data.seating.length} tables`],
                ['guests', 'Guest responses', `${data.guests.length} guests`],
              ] as Array<[DashboardView, string, string]>).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={dashboardView === value}
                  aria-controls={`pref-view-${value}`}
                  className={dashboardView === value ? 'is-active' : ''}
                  onClick={() => {
                    setDashboardView(value)
                    setServiceTableIndex(null)
                  }}
                >
                  <span>{label}</span>
                  <small>{count}</small>
                </button>
              ))}
            </div>

            <details className="pref-export-menu">
              <summary>
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 19h14" />
                </svg>
                Export
              </summary>
              <div>
                <button onClick={() => exportServicePackPdf()} disabled={exporting === 'pdf'}>
                  <b>Table service pack</b>
                  <span>{exporting === 'pdf' ? 'Building PDF…' : 'Complete PDF for floor staff'}</span>
                </button>
                <button onClick={exportSupplierSummaryCsv}>
                  <b>Supplier totals</b>
                  <span>CSV for catering and vendors</span>
                </button>
                <button onClick={exportResponsesCsv} disabled={data.guests.length === 0}>
                  <b>Guest details</b>
                  <span>Every response as CSV</span>
                </button>
              </div>
            </details>
          </section>

          {dashboardView === 'overview' && <section id="pref-view-overview" role="tabpanel" className="pref-overview" aria-label="Preference response overview">
            <article className="pref-response-card">
              <div className="pref-response-card__copy">
                <span className="pref-overview-label">Response progress</span>
                <strong>{data.summary.submitted}<small> of {data.summary.total} guests</small></strong>
                <p>{data.summary.outstanding === 0 ? 'Everyone has responded.' : `${data.summary.outstanding} guest${data.summary.outstanding === 1 ? '' : 's'} still to follow up.`}</p>
              </div>
              <div
                className="pref-response-ring"
                role="img"
                aria-label={`${responseRate}% responded`}
                style={{ background: `conic-gradient(#9f8fec ${responseRate}%, rgba(255,255,255,.11) 0)` }}
              >
                <span><strong>{responseRate}%</strong><small>complete</small></span>
              </div>
            </article>

            <div className="pref-kpi-grid">
              <article className={data.summary.outstanding ? 'is-attention' : 'is-complete'}>
                <span className="pref-kpi-icon" aria-hidden="true">{data.summary.outstanding ? '!' : '✓'}</span>
                <div><small>Outstanding</small><strong>{data.summary.outstanding}</strong></div>
                {data.summary.outstanding > 0
                  ? <button onClick={() => { setAnswered('no'); setDashboardView('guests') }}>View guests →</button>
                  : <span className="pref-kpi-note">Up to date</span>}
              </article>
              <article>
                <span className="pref-kpi-icon" aria-hidden="true">+1</span>
                <div><small>Plus ones</small><strong>{data.legacy.plus_ones}</strong></div>
                <span className="pref-kpi-note">Extra covers</span>
              </article>
              <article>
                <span className="pref-kpi-icon" aria-hidden="true">Q</span>
                <div><small>Questions</small><strong>{data.questions.length}</strong></div>
                <span className="pref-kpi-note">Being tracked</span>
              </article>
              {!data.legacy.aso_ebi_superseded && (
                <article>
                  <span className="pref-kpi-icon" aria-hidden="true">A</span>
                  <div><small>Aso Ebi</small><strong>{data.legacy.aso_ebi_quantity}<em> yd</em></strong></div>
                  <span className="pref-kpi-note">{data.legacy.aso_ebi_guests} requests</span>
                </article>
              )}
            </div>
          </section>}

          {dashboardView === 'overview' && data.questions.length > 0 && (
            <section className="pref-section pref-question-section" aria-label="Supplier planning totals">
              <div className="pref-section-heading">
                <div>
                  <p>Supplier planning</p>
                  <h2>Collated totals by option</h2>
                  <span>Every configured option is included—even when its current count is zero.</span>
                </div>
                <strong>{data.questions.length} question{data.questions.length === 1 ? '' : 's'}</strong>
              </div>
              <div className="pref-cards">
                {data.questions.map((question, index) => {
                  const highest = Math.max(1, ...question.breakdown.map((row) => row.count))
                  const coverage = data.summary.total
                    ? Math.round((question.answered / data.summary.total) * 100)
                    : 0
                  return (
                    <article key={question.id} className="pref-card">
                      <header>
                        <span className="pref-card__index">{String(index + 1).padStart(2, '0')}</span>
                        <div>
                          <span className="pref-card__kind">{questionKindLabel(question.kind)}</span>
                          <h3>{question.label}</h3>
                        </div>
                        <span className="pref-card__answered"><b>{question.answered}</b> answered</span>
                      </header>

                      {(question.kind === 'choice' || question.kind === 'multi_choice') && (
                        <div className="pref-card__selection-total">
                          <strong>{question.selection_count}</strong>
                          <span>{question.kind === 'multi_choice' ? 'total option selections' : 'choices collated'}</span>
                        </div>
                      )}

                      {question.kind === 'quantity' ? (
                        <div className="pref-card__quantity">
                          <p className="pref-card__total">{question.total}<span> {question.unit}</span></p>
                          <span>Total requested</span>
                        </div>
                      ) : question.kind === 'text' ? (
                        <div className="pref-card__quantity">
                          <p className="pref-card__total">{question.answered}</p>
                          <span>Written responses to review per guest</span>
                        </div>
                      ) : question.breakdown.length === 0 ? (
                        <div className="pref-card__empty"><span>—</span><p>No answers collected yet</p></div>
                      ) : (
                        <ul className="pref-breakdown">
                          {question.breakdown.map((row) => (
                            <li key={row.label}>
                              <span className="pref-breakdown__label">{row.label}</span>
                              <span className="pref-breakdown__track">
                                <i style={{ width: `${(row.count / highest) * 100}%` }} />
                              </span>
                              <span className="pref-breakdown__count">{row.count}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <footer>
                        <span>Response coverage</span>
                        <i><b style={{ width: `${coverage}%` }} /></i>
                        <strong>{coverage}%</strong>
                      </footer>
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          {dashboardView === 'tables' && data.seating.length > 0 && (
            <section id="pref-view-tables" role="tabpanel" className="pref-section pref-service-section">
              <div className="pref-section-heading">
                <div>
                  <p>Floor service</p>
                  <h2>Table-by-table serving plan</h2>
                  <span>Counts guide each tray; open a card for the named seat-by-seat service list.</span>
                </div>
                <strong>{data.seating.length} active table{data.seating.length === 1 ? '' : 's'}</strong>
              </div>

              <div className="pref-service-groups">
                {seatingGroups.map((group) => (
                  <section key={group.name} className="pref-service-group">
                    <div className="pref-service-group__heading">
                      <h3>{group.name}</h3>
                      <span>{group.tables.reduce((sum, table) => sum + table.guest_count, 0)} guests</span>
                    </div>
                    <div className="pref-service-grid">
                      {group.tables.map((table) => {
                        const index = data.seating.indexOf(table)
                        const mealOrders = getMealOrders(table)
                        return (
                          <article
                            key={`${table.section_name}-${table.table_label}`}
                            className={`pref-service-card${table.unassigned ? ' is-unassigned' : ''}`}
                          >
                            <header>
                              <div>
                                <span>{table.section_name}</span>
                                <h4>{table.table_label}</h4>
                              </div>
                              <button
                                type="button"
                                className="pref-service-card__open-top"
                                onClick={() => setServiceTableIndex(index)}
                                aria-label={`Open service details for ${table.table_label}`}
                              >
                                View <span aria-hidden="true">↗</span>
                              </button>
                            </header>

                            <div className="pref-service-stats">
                              <span><b>{table.guest_count}</b>{table.seats ? ` / ${table.seats}` : ''}<small>guests</small></span>
                              <span><b>{table.checked_in_count}</b><small>checked in</small></span>
                              <span className={table.responded_count < table.guest_count ? 'is-pending' : ''}>
                                <b>{table.responded_count}</b><small>responses</small>
                              </span>
                            </div>

                            {mealOrders.length > 0 ? (
                              <div className="pref-meal-orders">
                                <span className="pref-meal-orders__label">Complete meal orders</span>
                                <ul>
                                  {mealOrders.map((order) => (
                                    <li key={order.label}>
                                      <b>{order.count}</b>
                                      <span>{order.label}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <p className="pref-service-card__empty">No meal selections have been submitted for this table.</p>
                            )}

                            <button
                              type="button"
                              className="pref-service-card__open"
                              onClick={() => setServiceTableIndex(index)}
                            >
                              <span>Open seat-by-seat service list</span>
                              <b>{table.guests.length}</b>
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          )}

          {dashboardView === 'tables' && data.seating.length === 0 && (
            <section id="pref-view-tables" role="tabpanel" className="pref-view-empty">
              <span aria-hidden="true">T</span>
              <div><strong>No table service plan yet</strong><p>Seat guests at tables to organise their meal orders here.</p></div>
            </section>
          )}

          {serviceTableIndex !== null && data.seating[serviceTableIndex] && (() => {
            const table = data.seating[serviceTableIndex]
            const mealOrders = getMealOrders(table)
            const otherTotals = table.totals.filter((question) => !isMealQuestion(question))
            return (
              <div
                className="pref-service-modal"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setServiceTableIndex(null)
                }}
              >
                <section
                  id={`pref-service-modal-panel-${serviceTableIndex}`}
                  className={`pref-service-modal__panel${table.unassigned ? ' is-unassigned' : ''}`}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="pref-service-modal-title"
                >
                  <header className="pref-service-modal__header">
                    <div>
                      <span>{table.section_name}</span>
                      <h2 id="pref-service-modal-title">{table.table_label}</h2>
                      <p>Complete meal orders and named service instructions</p>
                    </div>
                    <div className="pref-service-modal__actions">
                      <button
                        type="button"
                        onClick={() => exportServicePackPdf(table, serviceTableIndex)}
                        disabled={Boolean(exporting)}
                      >
                        {exporting === `table-pdf-${serviceTableIndex}` ? 'Saving…' : 'PDF'}
                      </button>
                      <button
                        type="button"
                        onClick={() => exportTablePng(table, serviceTableIndex)}
                        disabled={Boolean(exporting)}
                      >
                        {exporting === `table-${serviceTableIndex}` ? 'Saving…' : 'PNG'}
                      </button>
                      <button
                        type="button"
                        className="pref-service-modal__close"
                        onClick={() => setServiceTableIndex(null)}
                        aria-label="Close table service details"
                      >×</button>
                    </div>
                  </header>

                  <div className="pref-service-stats pref-service-modal__stats">
                    <span><b>{table.guest_count}</b>{table.seats ? ` / ${table.seats}` : ''}<small>guests</small></span>
                    <span><b>{table.checked_in_count}</b><small>checked in</small></span>
                    <span className={table.responded_count < table.guest_count ? 'is-pending' : ''}>
                      <b>{table.responded_count}</b><small>responses</small>
                    </span>
                  </div>

                  <div className="pref-service-modal__body">
                    <section className="pref-service-modal__summary">
                      <div>
                        <p className="pref-service-modal__eyebrow">Kitchen order</p>
                        <h3>Complete meals</h3>
                      </div>
                      {mealOrders.length ? (
                        <ul className="pref-modal-meal-list">
                          {mealOrders.map((order) => (
                            <li key={order.label}><b>{order.count}</b><span>{order.label}</span></li>
                          ))}
                        </ul>
                      ) : <p className="pref-service-card__empty">No meal selections submitted.</p>}

                      {otherTotals.length > 0 && (
                        <div className="pref-modal-other">
                          <h3>Other table requirements</h3>
                          <div className="pref-service-totals">
                            {otherTotals.map((question) => (
                              <div key={question.id}>
                                <span>{question.label}</span>
                                <ul>
                                  {question.kind === 'quantity' ? (
                                    <li><b>{question.total ?? 0}</b> {question.unit}</li>
                                  ) : question.breakdown.length ? (
                                    question.breakdown.map((row) => (
                                      <li key={row.label}><b>{row.count}</b> {row.label}</li>
                                    ))
                                  ) : (
                                    <li><b>{question.answered}</b> written note{question.answered === 1 ? '' : 's'}</li>
                                  )}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="pref-service-modal__seats">
                      <div className="pref-service-modal__seat-heading">
                        <div>
                          <p className="pref-service-modal__eyebrow">Serve by name</p>
                          <h3>Seat-by-seat service list</h3>
                        </div>
                        <span>{table.guests.length} guest{table.guests.length === 1 ? '' : 's'}</span>
                      </div>
                      <ol className="pref-seat-list">
                        {table.guests.map((guest) => (
                          <li key={guest.id}>
                            <span className={`pref-seat-status${guest.checked_in ? ' is-arrived' : ''}`} aria-label={guest.checked_in ? 'Checked in' : 'Not arrived'} />
                            <div>
                              <strong>{guest.seat_number ? `Seat ${guest.seat_number} · ` : ''}{guest.full_name}</strong>
                              {guest.answers.length ? (
                                <ul className="pref-seat-preferences">
                                  {guest.answers.map((answer) => (
                                    <li key={answer.requirement_id}>
                                      <span>{answer.label}</span>
                                      <b>{answer.value}</b>
                                    </li>
                                  ))}
                                </ul>
                              ) : <p>Preferences pending</p>}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  </div>
                </section>
              </div>
            )
          })()}

          {dashboardView === 'guests' && <section id="pref-view-guests" role="tabpanel" className="pref-section pref-roster-section">
            <div className="pref-roster-heading">
              <div>
                <p>Guest-level detail</p>
                <h2>Every guest</h2>
                <span>Open a row to review contact, attendance and every submitted answer.</span>
              </div>
              <strong>{data.guests.length}<span> showing</span></strong>
            </div>
            <div className="pref-toolbar">
              <label className="pref-guest-search">
                <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search guest name…"
                  aria-label="Search guests by name"
                />
              </label>
              <div className="pref-filters" role="group" aria-label="Filter by response">
                {([
                  ['', 'Everyone'],
                  ['yes', 'Responded'],
                  ['no', 'Outstanding'],
                ] as Array<[AnsweredFilter, string]>).map(([value, label]) => (
                  <button
                    key={value || 'all'}
                    className={answered === value ? 'is-active' : ''}
                    onClick={() => setAnswered(value)}
                    aria-pressed={answered === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="pref-empty">Loading…</p>
            ) : data.guests.length === 0 ? (
              <p className="pref-empty">
                {search || answered ? 'No guests match that filter.' : 'No guests on this event yet.'}
              </p>
            ) : (
              <div className="pref-table-wrap">
                <table className="pref-table">
                  <thead>
                    <tr>
                      <th>Guest</th>
                      {data.columns.map((column) => (
                        <th key={column.id}>{column.label}</th>
                      ))}
                      {!data.legacy.aso_ebi_superseded && <th>Aso Ebi</th>}
                      <th>Plus one</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.guests.map((guest) => (
                      <GuestRow
                        key={guest.id}
                        guest={guest}
                        columns={data.columns}
                        showLegacyAsoEbi={!data.legacy.aso_ebi_superseded}
                        expanded={expanded === guest.id}
                        onToggle={() => setExpanded(expanded === guest.id ? null : guest.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>}
        </>
      )}

      {!data && loading && <p className="pref-empty">Loading preferences…</p>}
    </div>
  )
}

function GuestRow({
  guest, columns, showLegacyAsoEbi, expanded, onToggle,
}: {
  guest: PreferenceGuest
  columns: PreferenceDashboard['columns']
  /** Hidden when a configured question already reports this guest's fabric. */
  showLegacyAsoEbi: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const byKey = new Map(guest.answers.map((answer) => [answer.key, answer]))
  const submitted = formatDate(guest.submitted_at)

  return (
    <>
      <tr
        className={`pref-row${expanded ? ' is-expanded' : ''}${submitted ? '' : ' is-outstanding'}`}
        onClick={onToggle}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle() }
        }}
      >
        <td>
          <span className="pref-name">{guest.full_name}</span>
          <span className="pref-meta">
            {guest.table_number ? `T-${guest.table_number}` : 'No table'}
            {submitted ? ` · ${submitted}` : ' · not submitted'}
          </span>
        </td>
        {columns.map((column) => {
          const answer = byKey.get(column.key)
          return (
            <td key={column.id}>
              {answer?.value
                ? <span className="pref-value">{answer.value}</span>
                : <span className="pref-missing">—</span>}
            </td>
          )
        })}
        {showLegacyAsoEbi && (
          <td>
            {guest.aso_ebi_requested
              ? <span className="pref-value">{guest.aso_ebi_quantity} yards</span>
              : <span className="pref-missing">—</span>}
          </td>
        )}
        <td>
          {guest.plus_one_attending
            ? <span className="pref-pill">Yes</span>
            : <span className="pref-missing">—</span>}
        </td>
      </tr>

      {expanded && (
        <tr className="pref-detail">
          <td colSpan={columns.length + (showLegacyAsoEbi ? 3 : 2)}>
            <div className="pref-detail__inner">
              <dl>
                <div><dt>Phone</dt><dd>{guest.phone_number || '—'}</dd></div>
                <div><dt>Ticket</dt><dd>{guest.ticket_type || '—'}</dd></div>
                <div><dt>Table</dt><dd>{guest.table_number || 'Not seated'}</dd></div>
                <div><dt>Check-in</dt><dd>{guest.status === 'checked_in' ? 'Arrived' : 'Not arrived'}</dd></div>
                <div>
                  <dt>Preferences</dt>
                  <dd>{submitted ? `Submitted ${submitted}` : 'Not submitted'}</dd>
                </div>
              </dl>

              {guest.answers.length > 0 ? (
                <ul className="pref-answers">
                  {guest.answers.map((answer) => (
                    <li key={answer.requirement_id}>
                      <span>{answer.label}</span>
                      <strong>{answer.value || '—'}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pref-note">
                  This guest has not answered any questions yet.
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
