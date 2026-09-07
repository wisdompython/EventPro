'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { api, Event, SeatingFeature, SeatingPathPoint, SeatingSection, SeatingTable, SeatingTableGuests } from '@/lib/api'
import { ConfirmDialog, ConfirmRequest } from '@/components/admin/ConfirmDialog'
import './seating.css'

/** The plan's coordinate space. Sections are positioned inside this box and the
 *  canvas scales to fit, so a plan looks the same on any screen. */
const BASE_PLAN_WIDTH = 1400
const BASE_PLAN_HEIGHT = 950
const MAX_PLAN_SIZE = 5000
/** Breathing room kept beyond the furthest section so there is always
 *  somewhere to drag to. */
const PLAN_MARGIN = 90
/** Must match TABLE_STEP_X / TABLE_STEP_Y in the seating API. */
const TABLE_STEP = 150
const TABLE_SIZE = { round: 120, rectangle: 132 }
const SECTION_PADDING = 22
const SECTION_HEADER = 34
const EXPORT_HEADER_HEIGHT = 118
const MAX_EXPORT_PIXELS = 20_000_000

type ExportFormat = 'png' | 'pdf'
type PlanPoint = { x: number; y: number }
type RouteDrawing = { start: PlanPoint | null; preview: PlanPoint | null }
type EventScope = 'all' | 'upcoming' | 'past'

type SectionDraft = {
  kind: 'tables' | 'feature'
  feature: SeatingFeature
  name: string
  table_count: number
  seats_per_table: number
  shape: 'round' | 'rectangle'
  columns: number
  is_reserved: boolean
}

const NEW_SECTION: SectionDraft = {
  kind: 'tables',
  feature: 'stage',
  name: '',
  table_count: 6,
  seats_per_table: 8,
  shape: 'round',
  columns: 3,
  is_reserved: false,
}

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(value, max))
}

const MIN_SECTION = { width: 180, height: SECTION_HEADER + 70 }
const DEFAULT_PATH_POINTS: SeatingPathPoint[] = [
  { x: 0.04, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.96, y: 0.5 },
]

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
  if (sameDay && !event.is_ended) return { label: 'Event today', tone: 'live' }
  if (event.is_ended || eventDate.getTime() < now.getTime()) return { label: 'Past event', tone: 'past' }
  return { label: 'Upcoming', tone: 'upcoming' }
}

/** Venue fixtures a planner can drop on the floor plan, with the shape each
 *  one usually takes in a real room. */
const FEATURES: Array<{
  value: SeatingFeature
  label: string
  icon: string
  size: { width: number; height: number }
}> = [
  { value: 'stage',      label: 'Stage / band',   icon: '♪', size: { width: 320, height: 130 } },
  { value: 'dancefloor', label: 'Dance floor',    icon: '✦', size: { width: 300, height: 220 } },
  { value: 'walkway',    label: 'Walkway',        icon: '↕', size: { width: 130, height: 420 } },
  { value: 'path',       label: 'Route / path',    icon: '↝', size: { width: 520, height: 180 } },
  { value: 'entrance',   label: 'Entrance',       icon: '→', size: { width: 190, height: 100 } },
  { value: 'exit',       label: 'Emergency exit', icon: '!', size: { width: 170, height: 100 } },
  { value: 'guestexit',  label: 'Guest exit',     icon: '→', size: { width: 190, height: 100 } },
  { value: 'serviceexit', label: 'Service exit',  icon: '→', size: { width: 190, height: 100 } },
  { value: 'bar',        label: 'Bar',            icon: '▤', size: { width: 250, height: 110 } },
  { value: 'buffet',     label: 'Buffet',         icon: '▦', size: { width: 300, height: 110 } },
  { value: 'cake',       label: 'Cake table',     icon: '▲', size: { width: 150, height: 120 } },
  { value: 'gifts',      label: 'Gift table',     icon: '■', size: { width: 190, height: 110 } },
  { value: 'photo',      label: 'Photo booth',    icon: '□', size: { width: 180, height: 160 } },
  { value: 'restroom',   label: 'Restrooms',      icon: '○', size: { width: 170, height: 120 } },
  { value: 'area',       label: 'Area boundary',  icon: '',  size: { width: 700, height: 420 } },
  { value: 'restricted', label: 'Restricted area', icon: 'STAFF', size: { width: 420, height: 300 } },
  { value: 'other',      label: 'Other',          icon: '◇', size: { width: 200, height: 140 } },
]

function featureMeta(value: string) {
  return FEATURES.find((item) => item.value === value) ?? FEATURES[FEATURES.length - 1]
}

function routePoints(section: SeatingSection): SeatingPathPoint[] {
  return section.path_points?.length >= 2 ? section.path_points : DEFAULT_PATH_POINTS
}

/** Draw a smooth Catmull–Rom spline through every route point.
 *
 * The saved points remain the exact draggable positions planners choose; the
 * Bézier controls are derived at render time, so curves need no extra backend
 * fields and remain identical in the editor, PNG, and PDF output. */
function smoothRoutePathD(points: PlanPoint[]) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  }

  const tension = 0.82
  let d = `M ${points[0].x} ${points[0].y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[index - 1] ?? points[index]
    const start = points[index]
    const end = points[index + 1]
    const after = points[index + 2] ?? end
    const control1 = {
      x: start.x + ((end.x - before.x) / 6) * tension,
      y: start.y + ((end.y - before.y) / 6) * tension,
    }
    const control2 = {
      x: end.x - ((after.x - start.x) / 6) * tension,
      y: end.y - ((after.y - start.y) / 6) * tension,
    }
    d += ` C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`
  }
  return d
}

/** Where a connector's anchored end should sit, in plan units.
 *
 *  A route anchored to a block aims at that block's centre, so moving the
 *  block drags the route along with it instead of leaving it dangling. */
function anchorCentre(
  sections: SeatingSection[],
  sectionId: number | null,
  tableId: number | null,
): { x: number; y: number } | null {
  if (tableId != null) {
    for (const owner of sections) {
      const table = owner.tables.find((item) => item.id === tableId)
      if (table) {
        const size = sectionSize(owner)
        const layout = tableLayout(owner, size)
        const index = owner.tables.indexOf(table)
        const at = layout.positions[index]
        const half = layout.tableWidth / 2
        return at
          ? { x: owner.x + SECTION_PADDING + at.x + half, y: owner.y + SECTION_HEADER + at.y + half }
          : { x: owner.x + size.width / 2, y: owner.y + size.height / 2 }
      }
    }
    return null
  }
  if (sectionId != null) {
    const owner = sections.find((item) => item.id === sectionId)
    if (!owner) return null
    const size = sectionSize(owner)
    return { x: owner.x + size.width / 2, y: owner.y + size.height / 2 }
  }
  return null
}

/** A route's points in absolute plan coordinates, with anchored ends resolved. */
function routeGeometry(section: SeatingSection, all: SeatingSection[]) {
  const size = sectionSize(section)
  const points = routePoints(section).map((point) => ({
    x: section.x + point.x * size.width,
    y: section.y + point.y * size.height,
  }))
  const start = anchorCentre(all, section.path_start_section, section.path_start_table)
  const end = anchorCentre(all, section.path_end_section, section.path_end_table)
  if (start) points[0] = start
  if (end) points[points.length - 1] = end
  return points
}

function escapeSvg(value: string | number) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/** The size a section needs to hold its tables in a tidy grid.
 *
 *  Derived from the table count and the section's own columns setting rather
 *  than from stored coordinates, so a section is never left with dead space
 *  below its last row. */
function fittedSize(section: SeatingSection) {
  const count = section.tables.length
  if (count === 0) return { width: 210, height: SECTION_HEADER + 74 }
  const columns = Math.max(1, Math.min(count, section.columns || 3))
  const rows = Math.ceil(count / columns)
  // The last table in a row needs its own width, not a full step.
  // A table must be wide enough for its own label at full scale.
  const longest = Math.max(...section.tables.map((table) => table.label.length))
  const tableWidth = Math.max(TABLE_SIZE.round, longest * 8.2 + 22)
  const step = Math.max(TABLE_STEP, tableWidth + 20)
  const width = (columns - 1) * step + tableWidth
  const height = (rows - 1) * step + tableWidth
  // The header carries the name and the seated count, so a narrow section
  // must still be wide enough to show them rather than truncating.
  const headerWidth = section.name.length * 8.4 + 104
  return {
    width: Math.max(width + SECTION_PADDING * 2, headerWidth),
    height: height + SECTION_HEADER + SECTION_PADDING,
  }
}

/**
 * Where a section's tables sit for a given section size.
 *
 * Tables reflow when the section is resized: the number per row comes from the
 * width available, and the tables shrink (never below a readable floor) so a
 * whole row always fits. Nothing is written back to the server — the stored
 * x/y stay as the planner arranged them, and this is purely how they are drawn
 * at the current size.
 */
const MIN_TABLE = 72

function tableLayout(section: SeatingSection, size: { width: number; height: number }) {
  const count = section.tables.length
  if (count === 0) return { positions: [], scale: 1, tableWidth: TABLE_SIZE.round }

  const inner = Math.max(1, size.width - SECTION_PADDING * 2)
  const innerHeight = Math.max(1, size.height - SECTION_HEADER - SECTION_PADDING)
  // Same label-aware sizing fittedSize uses, so the two agree.
  const longest = Math.max(...section.tables.map((table) => table.label.length))
  const natural = Math.max(TABLE_SIZE.round, longest * 8.2 + 22)
  const STEP = Math.max(TABLE_STEP, natural + 20)

  // Prefer the section's own columns setting; fall back to whatever the
  // current width can actually fit.
  const preferred = Math.max(1, Math.min(count, section.columns || 3))
  const fits = Math.max(1, Math.min(count, Math.floor(inner / STEP)))
  let columns = Math.min(preferred, Math.max(fits, 1)) || 1
  if (inner >= preferred * STEP) columns = preferred
  let rows = Math.ceil(count / columns)

  // Shrink to fit when the section is tighter than the natural size, in either
  // direction, so tables never overflow their own section.
  const byWidth = inner / (columns * STEP)
  const byHeight = innerHeight / (rows * STEP)
  let scale = Math.min(1, byWidth, byHeight)

  // If shrinking hit the readable floor, fit more per row instead.
  if (natural * scale < MIN_TABLE) {
    scale = MIN_TABLE / natural
    columns = Math.max(1, Math.min(count, Math.floor(inner / (STEP * scale))))
    rows = Math.ceil(count / columns)
  }

  const step = STEP * scale
  const positions = section.tables.map((_, index) => ({
    x: (index % columns) * step,
    y: Math.floor(index / columns) * step,
  }))
  return { positions, scale, tableWidth: natural * scale }
}

/** A section's drawn size: whatever the planner set, else fitted to its tables. */
function sectionSize(section: SeatingSection) {
  if (section.kind === 'feature') {
    const preset = featureMeta(section.feature).size
    return {
      width: Math.max(MIN_SECTION.width, section.width ?? preset.width),
      height: Math.max(MIN_SECTION.height, section.height ?? preset.height),
    }
  }
  const fitted = fittedSize(section)
  return {
    width: Math.max(MIN_SECTION.width, section.width ?? fitted.width),
    height: Math.max(MIN_SECTION.height, section.height ?? fitted.height),
  }
}

export default function SeatingPlanPage() {
  const router = useRouter()
  const pathname = usePathname()
  const pathEventId = Number(pathname.split('/')[3]) || 0
  const [events, setEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [eventSearch, setEventSearch] = useState('')
  const [eventScope, setEventScope] = useState<EventScope>('all')

  const [sections, setSections] = useState<SeatingSection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null)

  const [draft, setDraft] = useState<SectionDraft>(NEW_SECTION)
  const [creating, setCreating] = useState(false)
  const [routeDrawing, setRouteDrawing] = useState<RouteDrawing | null>(null)
  const routeDrawGesture = useRef<{
    pointerId: number
    start: PlanPoint
    dragged: boolean
  } | null>(null)

  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null)
  const [selectedPathPoint, setSelectedPathPoint] = useState<number | null>(null)
  const [seating, setSeating] = useState<SeatingTableGuests | null>(null)
  const [seatingLoading, setSeatingLoading] = useState(false)

  /** In-app confirmation. A browser confirm() would break out of the admin
   *  styling, so destructive actions raise this dialog instead. */
  const [confirmAction, setConfirmAction] = useState<ConfirmRequest | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(1)
  const [canvasZoom, setCanvasZoom] = useState<number | null>(null)
  const [isCanvasFocused, setIsCanvasFocused] = useState(false)
  // Rows whose position has moved since the last save.
  const movedSections = useRef<Map<number, { x: number; y: number }>>(new Map())
  const resizedSections = useRef<Map<number, { width: number; height: number }>>(new Map())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.getEvents()
      .then((items) => {
        setEvents(items)
        const requested = pathEventId || Number(new URLSearchParams(window.location.search).get('event'))
        if (requested) {
          setSelectedEvent(items.find((item) => item.id === requested) ?? null)
          if (!pathEventId) router.replace(`/admin/seating-plan/${requested}`)
        }
      })
      .catch(() => setError('Could not load your events.'))
      .finally(() => setEventsLoading(false))
  }, [pathEventId, router])

  const eventCounts = useMemo(() => ({
    all: events.length,
    upcoming: events.filter((event) => eventTiming(event).tone !== 'past').length,
    past: events.filter((event) => eventTiming(event).tone === 'past').length,
  }), [events])

  const visibleEvents = useMemo(() => {
    const query = eventSearch.trim().toLocaleLowerCase()
    return events
      .filter((event) => {
        const timing = eventTiming(event)
        if (eventScope === 'upcoming' && timing.tone === 'past') return false
        if (eventScope === 'past' && timing.tone !== 'past') return false
        if (!query) return true
        return `${event.name} ${event.venue} ${event.id}`.toLocaleLowerCase().includes(query)
      })
      .sort((a, b) => {
        const aPast = eventTiming(a).tone === 'past'
        const bPast = eventTiming(b).tone === 'past'
        if (aPast !== bPast) return aPast ? 1 : -1
        const difference = new Date(a.date).getTime() - new Date(b.date).getTime()
        return aPast ? -difference : difference
      })
  }, [eventSearch, eventScope, events])

  const loadPlan = useCallback((eventId: number) => {
    setLoading(true)
    api.getSeatingSections(eventId)
      .then(setSections)
      .catch(() => setError('Could not load this plan.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedEvent) return
    setSelectedSectionId(null)
    setSelectedTableId(null)
    setSelectedPathPoint(null)
    setSeating(null)
    loadPlan(selectedEvent.id)
  }, [selectedEvent, loadPlan])

  const selectedSection = useMemo(
    () => sections.find((section) => section.id === selectedSectionId) ?? null,
    [sections, selectedSectionId],
  )
  const selectedTable = useMemo(() => {
    for (const section of sections) {
      const table = section.tables.find((item) => item.id === selectedTableId)
      if (table) return table
    }
    return null
  }, [sections, selectedTableId])

  // Load the guest lists for whichever table is selected.
  useEffect(() => {
    if (selectedTableId == null) { setSeating(null); return }
    setSeatingLoading(true)
    api.getSeatingTableGuests(selectedTableId)
      .then(setSeating)
      .catch(() => setSeating(null))
      .finally(() => setSeatingLoading(false))
  }, [selectedTableId])

  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast(''), 2600)
  }

  /** Batch position writes: a drag ends, we wait, then send everything moved. */
  const queuePositionSave = useCallback(() => {
    if (!selectedEvent) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      // A resize and a move of the same section travel as one entry.
      const sectionIds = new Set([
        ...movedSections.current.keys(),
        ...resizedSections.current.keys(),
      ])
      const sectionMoves = Array.from(sectionIds).map((id) => {
        const current = sections.find((item) => item.id === id)
        const at = movedSections.current.get(id) ?? { x: current?.x ?? 0, y: current?.y ?? 0 }
        const size = resizedSections.current.get(id)
        return size ? { id, ...at, ...size } : { id, ...at }
      })
      movedSections.current.clear()
      resizedSections.current.clear()
      if (!sectionMoves.length) return
      api.saveSeatingPositions(selectedEvent.id, sectionMoves).catch(() => {
        setError('Could not save the new positions. They may revert on reload.')
      })
    }, 600)
  }, [selectedEvent, sections])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  /** Drag a whole section around the plan. */
  function startSectionDrag(event: React.PointerEvent, section: SeatingSection) {
    if ((event.target as HTMLElement).closest('.seating-table, button')) return
    event.preventDefault()
    setSelectedSectionId(section.id)
    setSelectedTableId(null)
    setSelectedPathPoint(null)

    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const scale = bounds.width / plan.width
    const size = sectionSize(section)
    const grabX = event.clientX - bounds.left - section.x * scale
    const grabY = event.clientY - bounds.top - section.y * scale

    const move = (moveEvent: PointerEvent) => {
      const x = clamp((moveEvent.clientX - bounds.left - grabX) / scale, plan.width - size.width)
      const y = clamp((moveEvent.clientY - bounds.top - grabY) / scale, plan.height - size.height)
      setSections((current) =>
        current.map((item) => (item.id === section.id ? { ...item, x, y } : item)),
      )
      movedSections.current.set(section.id, { x, y })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      queuePositionSave()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Select a table. Tables flow with their section, so they are not
   *  dragged individually. */
  function selectTable(event: React.PointerEvent, section: SeatingSection, table: SeatingTable) {
    event.stopPropagation()
    setSelectedSectionId(section.id)
    setSelectedTableId(table.id)
    setSelectedPathPoint(null)
  }

  /** Drag the corner handle to resize a section. */
  function startSectionResize(event: React.PointerEvent, section: SeatingSection) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedSectionId(section.id)

    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const scale = bounds.width / plan.width
    const start = sectionSize(section)
    const originX = event.clientX
    const originY = event.clientY

    const move = (moveEvent: PointerEvent) => {
      const width = Math.max(MIN_SECTION.width, start.width + (moveEvent.clientX - originX) / scale)
      const height = Math.max(MIN_SECTION.height, start.height + (moveEvent.clientY - originY) / scale)
      setSections((current) =>
        current.map((item) => (item.id === section.id ? { ...item, width, height } : item)),
      )
      resizedSections.current.set(section.id, { width, height })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      queuePositionSave()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function nudgeSection(section: SeatingSection, dx: number, dy: number) {
    const size = sectionSize(section)
    const x = clamp(section.x + dx, plan.width - size.width)
    const y = clamp(section.y + dy, plan.height - size.height)
    setSections((current) => current.map((item) => (item.id === section.id ? { ...item, x, y } : item)))
    movedSections.current.set(section.id, { x, y })
    queuePositionSave()
  }

  async function createSection(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    if (!selectedEvent || !draft.name.trim()) return
    if (draft.kind === 'feature' && draft.feature === 'path') {
      setRouteDrawing({ start: null, preview: null })
      setSelectedSectionId(null)
      setSelectedTableId(null)
      setSelectedPathPoint(null)
      showToast('Click the route start point, then its end point')
      return
    }
    setCreating(true)
    setError('')
    try {
      // Stack new sections down the plan rather than on top of each other.
      const created = await api.createSeatingSection(
        draft.kind === 'feature'
          ? {
              event: selectedEvent.id,
              name: draft.name.trim(),
              kind: 'feature',
              feature: draft.feature,
            }
          : {
              event: selectedEvent.id,
              name: draft.name.trim(),
              kind: 'tables',
              table_count: draft.table_count,
              seats_per_table: draft.seats_per_table,
              shape: draft.shape,
              columns: draft.columns,
              is_reserved: draft.is_reserved,
            },
      )
      const placed = { ...created, x: 40, y: 40 + sections.length * 40 }
      setSections((current) => [...current, placed])
      movedSections.current.set(created.id, { x: placed.x, y: placed.y })
      queuePositionSave()
      setDraft(NEW_SECTION)
      setSelectedSectionId(created.id)
      setSelectedTableId(null)
      showToast(
        created.kind === 'feature'
          ? `${created.name} added`
          : `${created.name} added with ${created.tables.length} tables`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that section.')
    } finally {
      setCreating(false)
    }
  }

  function pointOnPlan(event: React.PointerEvent<SVGSVGElement>): PlanPoint {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.round(clamp((event.clientX - bounds.left) / bounds.width, 1) * plan.width),
      y: Math.round(clamp((event.clientY - bounds.top) / bounds.height, 1) * plan.height),
    }
  }

  async function createDrawnRoute(start: PlanPoint, end: PlanPoint) {
    if (!selectedEvent || !draft.name.trim()) return

    const deltaX = Math.abs(end.x - start.x)
    const deltaY = Math.abs(end.y - start.y)
    if (Math.hypot(deltaX, deltaY) < 24) {
      setError('Place the route end farther from its start point.')
      return
    }

    const width = Math.max(MIN_SECTION.width, deltaX)
    const height = Math.max(MIN_SECTION.height, deltaY)
    const x = clamp(Math.min(start.x, end.x) - (width - deltaX) / 2, plan.width - width)
    const y = clamp(Math.min(start.y, end.y) - (height - deltaY) / 2, plan.height - height)
    const path_points = [start, end].map((point) => ({
      x: Math.round(clamp((point.x - x) / width, 1) * 10000) / 10000,
      y: Math.round(clamp((point.y - y) / height, 1) * 10000) / 10000,
    }))

    setCreating(true)
    // Leave drawing mode immediately after accepting the endpoint. This also
    // prevents a double-click from submitting the same route twice.
    setRouteDrawing(null)
    routeDrawGesture.current = null
    setError('')
    try {
      const created = await api.createSeatingSection({
        event: selectedEvent.id,
        name: draft.name.trim(),
        kind: 'feature',
        feature: 'path',
        x,
        y,
        width,
        height,
        path_points,
        path_arrows: 'end',
      })
      setSections((current) => [...current, created])
      setDraft(NEW_SECTION)
      setSelectedSectionId(created.id)
      setSelectedTableId(null)
      setSelectedPathPoint(null)
      showToast('Route drawn between the two points')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that route.')
    } finally {
      setCreating(false)
    }
  }

  function handleRouteDrawPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    event.preventDefault()
    event.stopPropagation()
    const point = pointOnPlan(event)
    if (!routeDrawing?.start) {
      routeDrawGesture.current = {
        pointerId: event.pointerId,
        start: point,
        dragged: false,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      setRouteDrawing({ start: point, preview: point })
      showToast('Start placed. Click the end point, or drag and release')
      return
    }
    void createDrawnRoute(routeDrawing.start, point)
  }

  function handleRouteDrawPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!routeDrawing?.start || creating) return
    // React's `currentTarget` is only guaranteed while the event handler is
    // running. Resolve the coordinates before entering the state updater,
    // which React may invoke after the event has been released.
    const preview = pointOnPlan(event)
    const gesture = routeDrawGesture.current
    if (gesture?.pointerId === event.pointerId && Math.hypot(
      preview.x - gesture.start.x,
      preview.y - gesture.start.y,
    ) >= 8) {
      gesture.dragged = true
    }
    setRouteDrawing((current) => current ? { ...current, preview } : current)
  }

  function handleRouteDrawPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    const gesture = routeDrawGesture.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    routeDrawGesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!gesture.dragged) return

    const end = pointOnPlan(event)
    if (Math.hypot(end.x - gesture.start.x, end.y - gesture.start.y) >= 24) {
      void createDrawnRoute(gesture.start, end)
    }
  }

  function handleRouteDrawPointerCancel(event: React.PointerEvent<SVGSVGElement>) {
    if (routeDrawGesture.current?.pointerId === event.pointerId) {
      routeDrawGesture.current = null
    }
  }

  async function updateSection(patch: Partial<SeatingSection>) {
    if (!selectedSection) return
    const previous = selectedSection
    setSections((current) =>
      current.map((item) => (item.id === previous.id ? { ...item, ...patch } : item)),
    )
    try {
      await api.updateSeatingSection(previous.id, patch)
    } catch (err) {
      setSections((current) => current.map((item) => (item.id === previous.id ? previous : item)))
      setError(err instanceof Error ? err.message : 'Could not save that change.')
    }
  }

  function removeSection() {
    if (!selectedSection) return
    const section = selectedSection
    const count = section.tables.length
    setConfirmAction({
      title: `Remove ${section.name}?`,
      body: section.kind === 'feature'
        ? 'This feature will be removed from the plan.'
        : `Its ${count} table${count === 1 ? '' : 's'} will be deleted. Guests keep their table number.`,
      confirmLabel: section.kind === 'feature' ? 'Remove feature' : 'Remove section',
      onConfirm: async () => {
        try {
          await api.deleteSeatingSection(section.id)
          setSections((current) => current.filter((item) => item.id !== section.id))
          setSelectedSectionId(null)
          setSelectedTableId(null)
        } catch {
          setError('Could not remove that section.')
        }
      },
    })
  }

  async function addTables(count: number) {
    if (!selectedSection) return
    try {
      const updated = await api.addSeatingTables(
        selectedSection.id, count, draft.seats_per_table, draft.shape,
      )
      setSections((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      showToast(`${count} table${count === 1 ? '' : 's'} added`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add tables.')
    }
  }

  /**
   * Arrange the whole plan into a room that reads correctly.
   *
   * A reception has a natural anatomy: the couple and the band at the top,
   * the dance floor in front of them, guest tables filling the middle, service
   * (bar, buffet, cake) down one side, amenities down the other, and the doors
   * at the bottom. Auto-arrange lays the plan out that way rather than leaving
   * blocks wherever they were dropped, so a plan is presentable in one click.
   */
  function autoArrange() {
    if (!sections.length) return

    const GAP = 46
    const EDGE = 50
    // Which side of the room each kind of fixture belongs on.
    const TOP: string[] = ['stage']
    const CENTRE: string[] = ['dancefloor']
    const RIGHT: string[] = ['buffet', 'bar', 'cake', 'gifts']
    const LEFT: string[] = ['photo', 'restroom']
    const BOTTOM: string[] = ['entrance', 'exit', 'guestexit', 'serviceexit', 'walkway']
    // Zones and hand-shaped routes keep their authored positions.
    const FIXED: string[] = ['area', 'restricted', 'path']

    const featureIn = (list: string[]) =>
      sections.filter((item) => item.kind === 'feature' && list.includes(item.feature))
    const tableSections = sections.filter((item) => item.kind === 'tables')
    const leftovers = sections.filter(
      (item) =>
        item.kind === 'feature' &&
        ![...TOP, ...CENTRE, ...RIGHT, ...LEFT, ...BOTTOM, ...FIXED].includes(item.feature),
    )

    const placed = new Map<number, { x: number; y: number }>()
    // Arranging resets a hand-resized table section back to the size its
    // tables actually need, so the room has no dead space in it.
    const size = (item: SeatingSection) =>
      item.kind === 'tables' ? fittedSize(item) : sectionSize(item)

    // Reserved sections (high table, family) sit closest to the stage.
    const ordered = [...tableSections].sort((a, b) => {
      if (a.is_reserved !== b.is_reserved) return a.is_reserved ? -1 : 1
      return a.position - b.position || a.id - b.id
    })

    // --- Side columns first: they set how wide the centre can be. ---
    const rightCol = featureIn(RIGHT)
    const leftCol = featureIn(LEFT)
    const rightWidth = rightCol.length ? Math.max(...rightCol.map((i) => size(i).width)) : 0
    const leftWidth = leftCol.length ? Math.max(...leftCol.map((i) => size(i).width)) : 0

    // --- Centre column: stage, dance floor, then the guest tables. ---
    // The centre is wide enough to stand guest sections beside each other —
    // a reception reads across the room, not as one long column. Aim for a
    // roughly landscape plan by giving the tables about three sections' width.
    const widestSection = Math.max(
      420,
      ...[...featureIn(TOP), ...featureIn(CENTRE), ...ordered].map((item) => size(item).width),
    )
    const perRow = ordered.length > 4 ? 3 : 2
    const centreWidth = Math.max(
      widestSection,
      perRow * widestSection + (perRow - 1) * GAP,
    )
    const centreLeft = EDGE + (leftWidth ? leftWidth + GAP : 0)

    let y = EDGE
    for (const item of [...featureIn(TOP), ...featureIn(CENTRE)]) {
      const dims = size(item)
      placed.set(item.id, { x: centreLeft + (centreWidth - dims.width) / 2, y })
      y += dims.height + GAP
    }

    // Guest tables flow in rows across the centre column.
    let rowX = centreLeft
    let rowHeight = 0
    for (const item of ordered) {
      const dims = size(item)
      if (rowX > centreLeft && rowX + dims.width > centreLeft + centreWidth) {
        rowX = centreLeft
        y += rowHeight + GAP
        rowHeight = 0
      }
      placed.set(item.id, { x: rowX, y })
      rowX += dims.width + GAP
      rowHeight = Math.max(rowHeight, dims.height)
    }
    y += rowHeight + GAP

    // --- Stack the side columns down their own edges. ---
    let rightY = EDGE
    for (const item of rightCol) {
      const dims = size(item)
      placed.set(item.id, { x: centreLeft + centreWidth + GAP, y: rightY })
      rightY += dims.height + GAP
    }
    let leftY = EDGE
    for (const item of leftCol) {
      const dims = size(item)
      placed.set(item.id, { x: EDGE, y: leftY })
      leftY += dims.height + GAP
    }

    // --- Doors and circulation along the bottom. ---
    const bottomY = Math.max(y, rightY, leftY) + GAP / 2
    let bottomX = EDGE
    for (const item of [...featureIn(BOTTOM), ...leftovers]) {
      const dims = size(item)
      // Walkways are tall by default; lay them flat along the bottom wall.
      const width = item.feature === 'walkway' ? Math.max(dims.width, 260) : dims.width
      const height = item.feature === 'walkway' ? Math.min(dims.height, 110) : dims.height
      placed.set(item.id, { x: bottomX, y: bottomY })
      bottomX += width + GAP
      if (item.feature === 'walkway') {
        resizedSections.current.set(item.id, { width, height })
      }
      void height
    }

    setSections((current) =>
      current.map((item) => {
        const at = placed.get(item.id)
        if (!at) return item
        const resize = resizedSections.current.get(item.id)
        if (item.kind === 'tables') {
          // null size means "fit the tables", which is what arranging restores.
          return { ...item, ...at, width: null, height: null }
        }
        return { ...item, ...at, ...(resize ?? {}) }
      }),
    )
    for (const [id, at] of placed) movedSections.current.set(id, at)
    // Persist the size reset alongside the move.
    for (const item of tableSections) {
      if (item.width !== null || item.height !== null) {
        api.updateSeatingSection(item.id, { width: null, height: null }).catch(() => {})
      }
    }
    queuePositionSave()
    showToast('Plan arranged')
  }

  async function relayout() {
    if (!selectedSection) return
    try {
      const updated = await api.relayoutSeatingSection(selectedSection.id)
      setSections((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      showToast('Tables tidied')
    } catch {
      setError('Could not tidy that section.')
    }
  }

  function removeTable(table: SeatingTable) {
    setConfirmAction({
      title: `Remove ${table.label}?`,
      body: 'Guests keep their table number; only the block is deleted.',
      confirmLabel: 'Remove table',
      onConfirm: async () => {
        try {
          await api.deleteSeatingTable(table.id)
          setSections((current) =>
            current.map((item) =>
              item.id === table.section
                ? { ...item, tables: item.tables.filter((row) => row.id !== table.id) }
                : item,
            ),
          )
          setSelectedTableId(null)
        } catch {
          setError('Could not remove that table.')
        }
      },
    })
  }

  function patchTable(table: SeatingTable, patch: Partial<SeatingTable>) {
    setSections((current) =>
      current.map((item) =>
        item.id === table.section
          ? { ...item, tables: item.tables.map((row) => (row.id === table.id ? { ...row, ...patch } : row)) }
          : item,
      ),
    )
  }

  async function saveTable(table: SeatingTable, patch: Partial<SeatingTable>) {
    try {
      await api.updateSeatingTable(table.id, patch)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that table.')
      if (selectedEvent) loadPlan(selectedEvent.id)
    }
  }

  async function seatGuest(guestId: string) {
    if (!selectedTable) return
    await api.assignSeatingGuests(selectedTable.id, [guestId])
    setSeating(await api.getSeatingTableGuests(selectedTable.id))
    patchTable(selectedTable, { assigned: selectedTable.assigned + 1 })
  }

  async function unseatGuest(guestId: string) {
    if (!selectedTable) return
    await api.assignSeatingGuests(selectedTable.id, [], [guestId])
    setSeating(await api.getSeatingTableGuests(selectedTable.id))
    patchTable(selectedTable, { assigned: Math.max(0, selectedTable.assigned - 1) })
  }

  /** The footprint occupied by placed items. This is deliberately separate
   *  from the saved canvas size: planners may make the artboard smaller, then
   *  use "Fit plan" whenever they want to bring every item back into view. */
  const contentBounds = useMemo(() => {
    let right = BASE_PLAN_WIDTH
    let bottom = BASE_PLAN_HEIGHT
    for (const section of sections) {
      const size = sectionSize(section)
      right = Math.max(right, section.x + size.width)
      bottom = Math.max(bottom, section.y + size.height)
    }
    return { width: right, height: bottom }
  }, [sections])

  const plan = useMemo(() => ({
    width: selectedEvent?.seating_plan_width || BASE_PLAN_WIDTH,
    height: selectedEvent?.seating_plan_height || BASE_PLAN_HEIGHT,
  }), [selectedEvent?.seating_plan_width, selectedEvent?.seating_plan_height])

  const hasClippedContent = contentBounds.width > plan.width || contentBounds.height > plan.height

  useEffect(() => {
    const wrap = canvasWrapRef.current
    if (!wrap) return

    const updateFitScale = () => {
      const availableWidth = Math.max(280, wrap.clientWidth - 32)
      // Fit to width, not height. A tall plan should scroll vertically rather
      // than becoming too small to read.
      setFitScale(Math.min(1, availableWidth / plan.width))
    }

    const frame = window.requestAnimationFrame(updateFitScale)
    const observer = new ResizeObserver(updateFitScale)
    observer.observe(wrap)
    window.addEventListener('resize', updateFitScale)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', updateFitScale)
    }
  }, [plan.width, plan.height, isCanvasFocused])

  const displayScale = canvasZoom ?? fitScale

  function changeCanvasZoom(next: number | null) {
    setCanvasZoom(next === null ? null : Math.min(1.5, Math.max(0.25, next)))
  }

  function setCanvasSize(width: number, height: number) {
    // Freeze the current visual scale when a manual resize starts. Otherwise
    // Fit screen immediately counter-scales the canvas and the resize appears
    // to do nothing even though its saved dimensions are changing.
    if (canvasZoom === null) setCanvasZoom(displayScale)
    setSelectedEvent((current) => current ? {
      ...current,
      seating_plan_width: Math.round(Math.min(MAX_PLAN_SIZE, Math.max(BASE_PLAN_WIDTH, width))),
      seating_plan_height: Math.round(Math.min(MAX_PLAN_SIZE, Math.max(BASE_PLAN_HEIGHT, height))),
    } : current)
  }

  async function saveCanvasSize(width = plan.width, height = plan.height) {
    if (!selectedEvent) return
    const next = {
      seating_plan_width: Math.round(Math.min(MAX_PLAN_SIZE, Math.max(BASE_PLAN_WIDTH, width))),
      seating_plan_height: Math.round(Math.min(MAX_PLAN_SIZE, Math.max(BASE_PLAN_HEIGHT, height))),
    }
    setCanvasSize(next.seating_plan_width, next.seating_plan_height)
    try {
      const updated = await api.updateEvent(selectedEvent.id, next)
      setSelectedEvent(updated)
      setEvents((current) => current.map((item) => item.id === updated.id ? updated : item))
      showToast('Canvas size saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the canvas size.')
    }
  }

  function startCanvasResize(event: React.PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const scale = bounds.width / plan.width
    setCanvasZoom(scale)
    const start = { width: plan.width, height: plan.height }
    const origin = { x: event.clientX, y: event.clientY }
    let latest = start

    const move = (moveEvent: PointerEvent) => {
      latest = {
        width: start.width + (moveEvent.clientX - origin.x) / scale,
        height: start.height + (moveEvent.clientY - origin.y) / scale,
      }
      setCanvasSize(latest.width, latest.height)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      void saveCanvasSize(latest.width, latest.height)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Move one route node within its resizable bounding box. */
  function startPathPointDrag(
    event: React.PointerEvent<SVGCircleElement>,
    section: SeatingSection,
    pointIndex: number,
  ) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedSectionId(section.id)
    setSelectedTableId(null)
    setSelectedPathPoint(pointIndex)

    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    let latest = routePoints(section)
    let finished = false

    const finish = () => {
      if (finished) return
      finished = true
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('blur', finish)
      api.updateSeatingSection(section.id, { path_points: latest }).catch(() => {
        setError('Could not save the route. It may revert on reload.')
        if (selectedEvent) loadPlan(selectedEvent.id)
      })
    }

    const move = (moveEvent: PointerEvent) => {
      // If pointerup happened outside the browser, the next mouse movement
      // still tells us that no button is held. Stop rather than leaving the
      // route point attached to the cursor.
      if (moveEvent.pointerType === 'mouse' && moveEvent.buttons === 0) {
        finish()
        return
      }
      const bounds = svg.getBoundingClientRect()
      const point = {
        x: Math.round(clamp((moveEvent.clientX - bounds.left) / bounds.width, 1) * 10000) / 10000,
        y: Math.round(clamp((moveEvent.clientY - bounds.top) / bounds.height, 1) * 10000) / 10000,
      }
      latest = routePoints(section).map((item, index) => index === pointIndex ? point : item)
      setSections((current) => current.map((item) => (
        item.id === section.id ? { ...item, path_points: latest } : item
      )))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('blur', finish)
  }

  /** Drag a bend on a connector.
   *
   *  Connectors live in plan coordinates rather than inside a box, so a bend
   *  is converted back into the section's normalised space before saving.
   *  An anchored end is not draggable — it follows its block. */
  function startConnectorPointDrag(
    event: React.PointerEvent,
    route: SeatingSection,
    pointIndex: number,
  ) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedSectionId(route.id)
    setSelectedTableId(null)
    setSelectedPathPoint(pointIndex)

    const points = routePoints(route)
    const isStart = pointIndex === 0
    const isEnd = pointIndex === points.length - 1
    const anchored =
      (isStart && (route.path_start_section != null || route.path_start_table != null)) ||
      (isEnd && (route.path_end_section != null || route.path_end_table != null))
    if (anchored) return

    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const scale = bounds.width / plan.width
    const size = sectionSize(route)
    let latest = points
    let finished = false

    const finish = () => {
      if (finished) return
      finished = true
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('blur', finish)
      api.updateSeatingSection(route.id, { path_points: latest }).catch(() => {
        setError('Could not save the route. It may revert on reload.')
        if (selectedEvent) loadPlan(selectedEvent.id)
      })
    }

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerType === 'mouse' && moveEvent.buttons === 0) {
        finish()
        return
      }
      const planX = (moveEvent.clientX - bounds.left) / scale
      const planY = (moveEvent.clientY - bounds.top) / scale
      // Back into the route's own normalised space.
      const point = {
        x: Math.round(((planX - route.x) / size.width) * 10000) / 10000,
        y: Math.round(((planY - route.y) / size.height) * 10000) / 10000,
      }
      latest = points.map((item, index) => (index === pointIndex ? point : item))
      setSections((current) =>
        current.map((item) => (item.id === route.id ? { ...item, path_points: latest } : item)),
      )
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('blur', finish)
  }

  /** Blocks this route may connect to: every other section, plus their tables. */
  function connectorTargets(route: SeatingSection) {
    const options: Array<{ value: string; label: string }> = []
    for (const item of sections) {
      if (item.id === route.id) continue
      if (item.kind === 'feature' && item.feature === 'path') continue
      options.push({ value: `s:${item.id}`, label: item.name })
      for (const table of item.tables) {
        options.push({ value: `t:${table.id}`, label: `   ${item.name} · ${table.label}` })
      }
    }
    return options
  }

  function connectorValue(route: SeatingSection, end: 'start' | 'end') {
    const sectionId = end === 'start' ? route.path_start_section : route.path_end_section
    const tableId = end === 'start' ? route.path_start_table : route.path_end_table
    if (tableId != null) return `t:${tableId}`
    if (sectionId != null) return `s:${sectionId}`
    return ''
  }

  /** Anchor or free one end of a route. Only one of section/table is ever set. */
  function setConnector(route: SeatingSection, end: 'start' | 'end', value: string) {
    const [kind, rawId] = value.split(':')
    const id = rawId ? Number(rawId) : null
    const patch: Partial<SeatingSection> =
      end === 'start'
        ? { path_start_section: kind === 's' ? id : null, path_start_table: kind === 't' ? id : null }
        : { path_end_section: kind === 's' ? id : null, path_end_table: kind === 't' ? id : null }

    setSections((current) =>
      current.map((item) => (item.id === route.id ? { ...item, ...patch } : item)),
    )
    api.updateSeatingSection(route.id, patch).catch(() => {
      setError('Could not save that connection.')
      if (selectedEvent) loadPlan(selectedEvent.id)
    })
  }

  function addPathBend(section: SeatingSection) {
    const points = routePoints(section)
    const size = sectionSize(section)
    let after = selectedPathPoint != null && selectedPathPoint < points.length - 1
      ? selectedPathPoint
      : 0
    if (selectedPathPoint == null || selectedPathPoint >= points.length - 1) {
      let longest = -1
      for (let index = 0; index < points.length - 1; index += 1) {
        const dx = (points[index + 1].x - points[index].x) * size.width
        const dy = (points[index + 1].y - points[index].y) * size.height
        const length = Math.hypot(dx, dy)
        if (length > longest) { longest = length; after = index }
      }
    }
    const next = [...points]
    next.splice(after + 1, 0, {
      x: (points[after].x + points[after + 1].x) / 2,
      y: (points[after].y + points[after + 1].y) / 2,
    })
    setSelectedPathPoint(after + 1)
    void updateSection({ path_points: next })
  }

  function removePathBend(section: SeatingSection) {
    const points = routePoints(section)
    if (selectedPathPoint == null || selectedPathPoint <= 0 || selectedPathPoint >= points.length - 1) return
    const next = points.filter((_, index) => index !== selectedPathPoint)
    setSelectedPathPoint(null)
    void updateSection({ path_points: next })
  }

  function straightenPath(section: SeatingSection) {
    const points = routePoints(section)
    setSelectedPathPoint(null)
    void updateSection({ path_points: [points[0], points[points.length - 1]] })
  }

  const totals = useMemo(() => {
    const tables = sections.flatMap((section) => section.tables)
    return {
      sections: sections.length,
      tables: tables.length,
      seats: tables.reduce((sum, table) => sum + table.seats, 0),
      seated: tables.reduce((sum, table) => sum + (table.assigned ?? 0), 0),
    }
  }, [sections])

  function exportFileName() {
    if (!selectedEvent) return 'event-plan'
    const safeName = selectedEvent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return `${safeName || 'event'}-event-plan`
  }

  function featureExportColors(feature: SeatingFeature) {
    if (feature === 'stage') return { fill: '#f4effb', stroke: '#7c3aad' }
    if (feature === 'dancefloor') return { fill: '#eef4ff', stroke: '#2563eb' }
    if (feature === 'entrance' || feature === 'guestexit') return { fill: '#eef8f4', stroke: '#2f7d5c' }
    if (feature === 'exit') return { fill: '#fff0ef', stroke: '#c92828' }
    if (feature === 'serviceexit' || feature === 'bar' || feature === 'buffet') return { fill: '#fff7e8', stroke: '#b4791b' }
    if (feature === 'cake' || feature === 'gifts') return { fill: '#fff0f6', stroke: '#cb4e7e' }
    if (feature === 'photo') return { fill: '#edfafa', stroke: '#0e8a91' }
    if (feature === 'restricted') return { fill: '#fff2ed', stroke: '#be4a32' }
    if (feature === 'area') return { fill: '#f6f4ff', stroke: '#6757d9' }
    return { fill: '#f1f3f5', stroke: '#6e7785' }
  }

  function buildPlanSvg() {
    if (!selectedEvent || sections.length === 0) return null

    const orderedSections = [...sections].sort((left, right) => {
      const layer = (section: SeatingSection) => section.feature === 'area' ? 0 : section.feature === 'restricted' ? 1 : section.kind === 'tables' ? 2 : 3
      return layer(left) - layer(right)
    })

    const drawings = orderedSections.map((section) => {
      const size = sectionSize(section)
      if (section.kind === 'feature' && section.feature === 'path') {
        const points = routePoints(section)
          .map((point) => `${section.x + point.x * size.width},${section.y + point.y * size.height}`)
          .join(' ')
        const labelWidth = Math.max(120, Math.min(size.width - 16, section.name.length * 11 + 26))
        return `<g>
          <polyline points="${points}" fill="none" stroke="#ffffff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" />
          <polyline points="${points}" fill="none" stroke="#6757d9" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="20 12" />
          <rect x="${section.x + 8}" y="${section.y + 7}" width="${labelWidth}" height="28" rx="14" fill="#ffffff" stroke="#6757d9" stroke-width="1.5" />
          <text x="${section.x + 20}" y="${section.y + 27}" font-size="16" font-weight="800" fill="#27214a">${escapeSvg(section.name)}</text>
        </g>`
      }
      const layout = tableLayout(section, size)
      const featureColors = featureExportColors(section.feature || 'other')
      const sectionFill = section.kind === 'feature' ? featureColors.fill : section.is_reserved ? '#fff8e9' : '#ffffff'
      const sectionStroke = section.kind === 'feature' ? featureColors.stroke : section.is_reserved ? '#c98520' : '#7768da'
      const tables = section.tables.map((table, index) => {
        const position = layout.positions[index] ?? { x: table.x, y: table.y }
        const x = section.x + SECTION_PADDING + position.x
        const y = section.y + SECTION_HEADER + position.y
        const width = layout.tableWidth
        const centerX = x + width / 2
        const centerY = y + width / 2
        const seatOrbit = width * 0.44
        const seatRadius = Math.max(2.3, Math.min(5.5, (Math.PI * width * 0.82) / Math.max(1, table.seats) / 2.8))
        const seats = Array.from({ length: table.seats }, (_, seatIndex) => {
          const angle = -Math.PI / 2 + (seatIndex / table.seats) * Math.PI * 2
          const seatX = centerX + Math.cos(angle) * seatOrbit
          const seatY = centerY + Math.sin(angle) * seatOrbit
          const fill = seatIndex < (table.assigned ?? 0) ? '#9a8cf0' : '#dedbe5'
          return `<circle cx="${seatX}" cy="${seatY}" r="${seatRadius}" fill="${fill}" stroke="#ffffff" stroke-width="1.2" />`
        }).join('')
        const surfaceWidth = table.shape === 'round' ? width * 0.62 : width * 0.76
        const surfaceHeight = table.shape === 'round' ? surfaceWidth : width * 0.42
        const shape = table.shape === 'round'
          ? `<ellipse cx="${centerX}" cy="${centerY}" rx="${surfaceWidth / 2}" ry="${surfaceHeight / 2}" fill="#ffffff" stroke="#6757d9" stroke-width="2" />`
          : `<rect x="${centerX - surfaceWidth / 2}" y="${centerY - surfaceHeight / 2}" width="${surfaceWidth}" height="${surfaceHeight}" rx="8" fill="#ffffff" stroke="#6757d9" stroke-width="2" />`
        return `<g>${seats}${shape}
          <text x="${centerX}" y="${centerY - 2}" text-anchor="middle" font-size="13" font-weight="800" fill="#27214a">${escapeSvg(table.label)}</text>
          <text x="${centerX}" y="${centerY + 13}" text-anchor="middle" font-size="10" fill="#756e7f">${table.assigned ?? 0}/${table.seats}</text></g>`
      }).join('\n')

      const feature = section.kind === 'feature'
        ? `<text x="${section.x + size.width / 2}" y="${section.y + size.height / 2 + 8}" text-anchor="middle" font-size="28" font-weight="700" fill="${sectionStroke}">${escapeSvg(featureMeta(section.feature).icon)}</text>`
        : ''

      return `<g>
        <rect x="${section.x}" y="${section.y}" width="${size.width}" height="${size.height}" rx="14" fill="${sectionFill}" stroke="${sectionStroke}" stroke-width="2" stroke-dasharray="${section.kind === 'tables' ? '9 6' : '0'}" />
        <rect x="${section.x + 8}" y="${section.y + 7}" width="${Math.max(120, Math.min(size.width - 16, section.name.length * 11 + 26))}" height="28" rx="6" fill="#ffffff" fill-opacity="0.96" />
        <text x="${section.x + 18}" y="${section.y + 27}" font-size="16" font-weight="800" fill="#27214a">${escapeSvg(section.name)}</text>
        ${feature}
        ${tables}
      </g>`
    }).join('\n')

    const eventDate = new Date(selectedEvent.date).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    const eventDetails = [eventDate, selectedEvent.venue].filter(Boolean).join('  |  ')
    const exportHeight = plan.height + EXPORT_HEADER_HEIGHT
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${plan.width}" height="${exportHeight}" viewBox="0 0 ${plan.width} ${exportHeight}">
      <title>${escapeSvg(selectedEvent.name)} event plan</title>
      <defs>
        <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#c8c4d2" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#faf9fc" />
      <rect width="100%" height="${EXPORT_HEADER_HEIGHT}" fill="#10231d" />
      <rect y="${EXPORT_HEADER_HEIGHT - 5}" width="100%" height="5" fill="#e4573d" />
      <text x="42" y="44" font-family="Arial, sans-serif" font-size="30" font-weight="800" fill="#ffffff">${escapeSvg(selectedEvent.name)}</text>
      <text x="42" y="73" font-family="Arial, sans-serif" font-size="15" font-weight="600" fill="#d7e2de">${escapeSvg(eventDetails || 'Event plan')}</text>
      <text x="42" y="98" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#9fb2aa">EVENT &amp; SEATING PLAN</text>
      <text x="${plan.width - 42}" y="48" text-anchor="end" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#ffffff">${totals.tables} tables  |  ${totals.seats} seats</text>
      <text x="${plan.width - 42}" y="75" text-anchor="end" font-family="Arial, sans-serif" font-size="13" fill="#d7e2de">${totals.seated} assigned  |  ${Math.max(0, totals.seats - totals.seated)} available</text>
      <g transform="translate(0 ${EXPORT_HEADER_HEIGHT})">
        <rect width="100%" height="${plan.height}" fill="#faf9fc" />
        <rect width="100%" height="${plan.height}" fill="url(#grid)" />
        ${drawings}
      </g>
    </svg>`

    return { svg, width: plan.width, height: exportHeight }
  }

  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function renderPlanPng(svg: string, sourceWidth: number, sourceHeight: number) {
    const scale = Math.min(2, Math.sqrt(MAX_EXPORT_PIXELS / (sourceWidth * sourceHeight)))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image()
        nextImage.onload = () => resolve(nextImage)
        nextImage.onerror = () => reject(new Error('The event plan could not be rendered.'))
        nextImage.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Your browser could not prepare the export.')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/png')
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('The PNG file could not be created.')), 'image/png')
      })
      return { blob, dataUrl, width, height }
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  async function captureRenderedPlanPng() {
    const source = canvasRef.current
    if (!source || !selectedEvent) throw new Error('Open a seating plan before exporting it.')

    const pixelRatio = Math.min(2, Math.sqrt(MAX_EXPORT_PIXELS / (plan.width * plan.height)))
    const selectedNodes = Array.from(source.querySelectorAll('.is-selected'))
    source.classList.add('is-exporting')
    selectedNodes.forEach((node) => node.classList.remove('is-selected'))

    try {
      const { toCanvas } = await import('html-to-image')
      await document.fonts.ready
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      const planCanvas = await toCanvas(source, {
        backgroundColor: '#faf9fc',
        cacheBust: true,
        width: plan.width,
        height: plan.height,
        pixelRatio,
        style: {
          width: `${plan.width}px`,
          height: `${plan.height}px`,
          transform: 'none',
          transformOrigin: 'top left',
        },
        filter: (node) => !(node instanceof Element && node.matches(
          '.seating-canvas__size, .seating-canvas__resize, .seating-section__resize, .seating-path__node, .seating-route-draw-layer, .seating-route-draw-banner',
        )),
      })

      const headerHeight = Math.round(EXPORT_HEADER_HEIGHT * pixelRatio)
      const canvas = document.createElement('canvas')
      canvas.width = planCanvas.width
      canvas.height = planCanvas.height + headerHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Your browser could not prepare the export.')

      context.fillStyle = '#10231d'
      context.fillRect(0, 0, canvas.width, headerHeight)
      context.fillStyle = '#e4573d'
      context.fillRect(0, headerHeight - Math.max(4, Math.round(5 * pixelRatio)), canvas.width, Math.max(4, Math.round(5 * pixelRatio)))

      const left = 42 * pixelRatio
      const right = canvas.width - left
      const fitText = (value: string, maxWidth: number) => {
        if (context.measureText(value).width <= maxWidth) return value
        let result = value
        while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1)
        return `${result}…`
      }
      context.textBaseline = 'alphabetic'
      context.textAlign = 'left'
      context.fillStyle = '#ffffff'
      context.font = `800 ${30 * pixelRatio}px Arial, sans-serif`
      context.fillText(fitText(selectedEvent.name, canvas.width * 0.63), left, 44 * pixelRatio)

      const eventDate = new Date(selectedEvent.date).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
      const eventDetails = [eventDate, selectedEvent.venue].filter(Boolean).join('  |  ')
      context.fillStyle = '#d7e2de'
      context.font = `600 ${15 * pixelRatio}px Arial, sans-serif`
      context.fillText(fitText(eventDetails || 'Event plan', canvas.width * 0.63), left, 73 * pixelRatio)
      context.fillStyle = '#9fb2aa'
      context.font = `700 ${13 * pixelRatio}px Arial, sans-serif`
      context.fillText('EVENT & SEATING PLAN', left, 98 * pixelRatio)

      context.textAlign = 'right'
      context.fillStyle = '#ffffff'
      context.font = `700 ${14 * pixelRatio}px Arial, sans-serif`
      context.fillText(`${totals.tables} tables  |  ${totals.seats} seats`, right, 48 * pixelRatio)
      context.fillStyle = '#d7e2de'
      context.font = `${13 * pixelRatio}px Arial, sans-serif`
      context.fillText(`${totals.seated} assigned  |  ${Math.max(0, totals.seats - totals.seated)} available`, right, 75 * pixelRatio)

      context.drawImage(planCanvas, 0, headerHeight)
      const dataUrl = canvas.toDataURL('image/png')
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('The PNG file could not be created.')), 'image/png')
      })
      return { blob, dataUrl, width: canvas.width, height: canvas.height }
    } finally {
      source.classList.remove('is-exporting')
      selectedNodes.forEach((node) => node.classList.add('is-selected'))
    }
  }

  async function exportPlan(format: ExportFormat) {
    if (!selectedEvent || sections.length === 0) return

    setExportingFormat(format)
    setError('')
    try {
      const image = await captureRenderedPlanPng()
      const baseName = exportFileName()
      if (format === 'png') {
        downloadBlob(image.blob, `${baseName}.png`)
      } else {
        const { jsPDF } = await import('jspdf')
        const orientation = image.width >= image.height ? 'landscape' : 'portrait'
        const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a3', compress: true })
        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()
        const margin = 10
        const availableWidth = pageWidth - margin * 2
        const availableHeight = pageHeight - margin * 2
        const ratio = Math.min(availableWidth / image.width, availableHeight / image.height)
        const imageWidth = image.width * ratio
        const imageHeight = image.height * ratio
        pdf.setFillColor(245, 243, 238)
        pdf.rect(0, 0, pageWidth, pageHeight, 'F')
        pdf.addImage(
          image.dataUrl,
          'PNG',
          (pageWidth - imageWidth) / 2,
          (pageHeight - imageHeight) / 2,
          imageWidth,
          imageHeight,
          undefined,
          'FAST',
        )
        pdf.setProperties({
          title: `${selectedEvent.name} event plan`,
          subject: 'Event and seating plan',
          creator: 'Event Pro',
        })
        pdf.save(`${baseName}.pdf`)
      }
      showToast(`${format.toUpperCase()} event plan downloaded`)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not export the ${format.toUpperCase()} file.`)
    } finally {
      setExportingFormat(null)
    }
  }

  // ── Event picker ──────────────────────────────────────────────────────────
  if (!selectedEvent) {
    return (
      <div className="admin-page seating-picker-page">
        <div className="admin-page__header seating-picker-header">
          <div className="admin-page__identity">
            <p className="admin-page__eyebrow">Venue planning</p>
            <h1 className="admin-page__title">Choose an event plan</h1>
            <p className="admin-page__description">
              Build the complete guest journey—from entrances and routes to tables, service areas and exits.
            </p>
          </div>
          {!eventsLoading && events.length > 0 && (
            <div className="seating-picker-overview" aria-label="Plan overview">
              <div><strong>{events.length}</strong><span>Event plans</span></div>
              <div><strong>{eventCounts.upcoming}</strong><span>Active</span></div>
              <div><strong>{events.reduce((sum, event) => sum + (event.guest_count || 0), 0)}</strong><span>Guests</span></div>
            </div>
          )}
        </div>

        {error && (
          <div className="seating-alert" role="alert">
            {error}
            <button onClick={() => setError('')} aria-label="Dismiss">×</button>
          </div>
        )}

        {eventsLoading ? (
          <div className="seating-picker-loading" aria-live="polite">
            <i />
            <p>Loading event plans…</p>
          </div>
        ) : events.length === 0 ? (
          <div className="seating-picker-empty">
            <span aria-hidden="true">⌗</span>
            <strong>Your planning room is ready</strong>
            <p>Create an event, then return here to map its venue and seating.</p>
            <button onClick={() => router.push('/admin/event-management/add')}>Create an event</button>
          </div>
        ) : (
          <section className="seating-picker-shell">
            <div className="seating-picker-toolbar">
              <div>
                <strong>Event plans</strong>
                <span>Select a plan to continue editing</span>
              </div>
              <label className="seating-event-search">
                <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" />
                </svg>
                <input
                  type="search"
                  value={eventSearch}
                  onChange={(event) => setEventSearch(event.target.value)}
                  placeholder="Search event, venue or ID…"
                  aria-label="Search event plans"
                />
              </label>
              <div className="seating-event-scopes" role="group" aria-label="Filter event plans">
                {([
                  ['all', 'All plans', eventCounts.all],
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
              <div className="seating-picker-no-results">
                <span aria-hidden="true">⌕</span>
                <strong>No matching plans</strong>
                <p>Try another event name, venue, or plan ID.</p>
                <button onClick={() => { setEventSearch(''); setEventScope('all') }}>Clear filters</button>
              </div>
            ) : (
              <div className="seating-event-grid">
                {visibleEvents.map((event) => {
                  const timing = eventTiming(event)
                  const date = new Date(event.date)
                  const confirmed = event.confirmed_count || 0
                  const guests = event.guest_count || 0
                  return (
                    <button
                      key={event.id}
                      className="seating-event-card"
                      onClick={() => router.push(`/admin/seating-plan/${event.id}`)}
                    >
                      <span className="seating-event-card__accent" aria-hidden="true" />
                      <span className="seating-event-card__topline">
                        <span className="seating-event-id">Plan #{event.id}</span>
                        <span className={`seating-event-status is-${timing.tone}`}><i />{timing.label}</span>
                      </span>
                      <span className="seating-event-card__body">
                        <span className="seating-event-date" aria-hidden="true">
                          <b>{date.toLocaleDateString('en-GB', { day: '2-digit' })}</b>
                          <small>{date.toLocaleDateString('en-GB', { month: 'short' })}</small>
                        </span>
                        <span className="seating-event-card__identity">
                          <strong>{event.name}</strong>
                          <span>{formatEventDate(event.date)}</span>
                          <span className="seating-event-venue">{event.venue || 'Venue not added'}</span>
                        </span>
                      </span>
                      <span className="seating-event-card__stats">
                        <span><b>{guests}</b><small>Registered guests</small></span>
                        <span><b>{confirmed}</b><small>Confirmed</small></span>
                        <span><b>{event.checked_in_count || 0}</b><small>Checked in</small></span>
                      </span>
                      <span className="seating-event-card__footer">
                        <span>Venue map &amp; seating layout</span>
                        <strong>Open plan <i aria-hidden="true">→</i></strong>
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
    <div className={`admin-page seating-page${isCanvasFocused ? ' is-canvas-focused' : ''}`}>
      <div className="admin-page__header">
        <div className="admin-page__identity">
          <p className="admin-page__eyebrow">Event planner · Plan #{selectedEvent.id}</p>
          <h1 className="admin-page__title">{selectedEvent.name}</h1>
          <p className="admin-page__description">
            Map the venue from the gate inward. Move areas and tables, then drag a route&apos;s orange points to shape smooth curves.
          </p>
        </div>
        <div className="admin-page__actions">
          {sections.length > 0 && (
            <button
              className="admin-secondary-action"
              onClick={autoArrange}
              title="Lay the room out: stage and dance floor at the top, tables in the middle, service at the sides, doors at the bottom"
            >
              Auto-arrange
            </button>
          )}
          <button className="admin-secondary-action" onClick={() => router.push('/admin/seating-plan')}>
            Change event
          </button>
        </div>
      </div>

      {error && (
        <div className="seating-alert" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label="Dismiss">×</button>
        </div>
      )}
      {toast && <div className="seating-toast">{toast}</div>}

      {confirmAction && (
        <ConfirmDialog {...confirmAction} onCancel={() => setConfirmAction(null)} />
      )}

      <div className="seating-stats">
        <div><small>Sections</small><strong>{totals.sections}</strong></div>
        <div><small>Tables</small><strong>{totals.tables}</strong></div>
        <div><small>Capacity</small><strong>{totals.seats} <em>seats</em></strong></div>
        <div><small>Seated</small><strong>{totals.seated}</strong></div>
        <div><small>Unfilled</small><strong>{Math.max(0, totals.seats - totals.seated)}</strong></div>
      </div>

      <div className="seating-capacity-meter" aria-label={`${totals.seated} of ${totals.seats} seats assigned`}>
        <div><span>Guest capacity</span><strong>{totals.seats} seats planned</strong></div>
        <div className="seating-capacity-meter__track"><i style={{ width: `${totals.seats ? Math.min(100, totals.seated / totals.seats * 100) : 0}%` }} /></div>
        <p>{totals.seated} assigned <span>·</span> {Math.max(0, totals.seats - totals.seated)} available</p>
      </div>

      <div className="seating-map-legend" aria-label="Venue access legend">
        <span><i className="is-guest" />Guest access</span>
        <span><i className="is-staff" />Staff only</span>
        <span><i className="is-emergency" />Emergency only</span>
      </div>

      <div className={`seating-layout${isCanvasFocused ? ' is-canvas-focused' : ''}`}>
        <div ref={canvasWrapRef} className="seating-canvas-wrap">
          <div className="seating-canvas-toolbar" aria-label="Canvas view controls">
            <button
              type="button"
              className="seating-canvas-toolbar__focus"
              aria-label={isCanvasFocused ? 'Exit wide canvas view' : 'Open wide canvas view'}
              title={isCanvasFocused ? 'Exit wide canvas view' : 'Use the full workspace for the canvas'}
              onClick={() => setIsCanvasFocused((current) => !current)}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
                {isCanvasFocused ? (
                  <path d="M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6" />
                ) : (
                  <path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5" />
                )}
              </svg>
              <span>{isCanvasFocused ? 'Exit wide view' : 'Wide view'}</span>
            </button>
            <div className="seating-canvas-toolbar__exports" aria-label="Export event plan">
              <span>Download</span>
              <button
                type="button"
                className="seating-canvas-toolbar__export"
                onClick={() => void exportPlan('png')}
                disabled={sections.length === 0 || exportingFormat !== null}
                title="Download a high-resolution PNG for sharing"
              >
                {exportingFormat === 'png' ? 'Preparing…' : 'PNG'}
              </button>
              <button
                type="button"
                className="seating-canvas-toolbar__export"
                onClick={() => void exportPlan('pdf')}
                disabled={sections.length === 0 || exportingFormat !== null}
                title="Download a customer-ready A3 PDF"
              >
                {exportingFormat === 'pdf' ? 'Preparing…' : 'PDF'}
              </button>
            </div>
            <span className="seating-canvas-toolbar__spacer" />
            <button
              type="button"
              className={`seating-canvas-toolbar__fit${canvasZoom === null ? ' is-active' : ''}`}
              onClick={() => changeCanvasZoom(null)}
            >
              Fit width
            </button>
            <span className="seating-canvas-toolbar__zoom">
              <button type="button" aria-label="Zoom out" onClick={() => changeCanvasZoom(displayScale - 0.1)}>−</button>
              <output aria-label="Canvas zoom">{Math.round(displayScale * 100)}%</output>
              <button type="button" aria-label="Zoom in" onClick={() => changeCanvasZoom(displayScale + 0.1)}>+</button>
            </span>
            <button type="button" onClick={() => changeCanvasZoom(1)}>100%</button>
          </div>
          {loading ? (
            <p className="seating-empty">Loading plan…</p>
          ) : sections.length === 0 ? (
            <div className="seating-blank">
              <h2>This plan is empty</h2>
              <p>Create your first section — a high table, a family block, or a section for one guest type.</p>
            </div>
          ) : (
            <div
              className="seating-canvas-stage"
              style={{ width: `${plan.width * displayScale}px`, height: `${plan.height * displayScale}px` }}
            >
              <div
                ref={canvasRef}
                className={`seating-canvas${selectedTableId !== null ? ' has-table-focus' : ''}`}
                style={{
                  width: `${plan.width}px`,
                  height: `${plan.height}px`,
                  transform: `scale(${displayScale})`,
                }}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) {
                    setSelectedSectionId(null)
                    setSelectedTableId(null)
                    setSelectedPathPoint(null)
                  }
                }}
              >
              <span className="seating-canvas__size" aria-hidden="true">
                {Math.round(plan.width)} × {Math.round(plan.height)}
              </span>
              {routeDrawing && (
                <>
                  <svg
                    className="seating-route-draw-layer"
                    viewBox={`0 0 ${plan.width} ${plan.height}`}
                    preserveAspectRatio="none"
                    role="application"
                    aria-label={routeDrawing.start ? 'Choose the route end point' : 'Choose the route start point'}
                    onPointerDown={handleRouteDrawPointerDown}
                    onPointerMove={handleRouteDrawPointerMove}
                    onPointerUp={handleRouteDrawPointerUp}
                    onPointerCancel={handleRouteDrawPointerCancel}
                  >
                    {routeDrawing.start && routeDrawing.preview && (
                      <>
                        <line
                          className="seating-route-draw-preview__edge"
                          x1={routeDrawing.start.x}
                          y1={routeDrawing.start.y}
                          x2={routeDrawing.preview.x}
                          y2={routeDrawing.preview.y}
                        />
                        <line
                          className="seating-route-draw-preview__line"
                          x1={routeDrawing.start.x}
                          y1={routeDrawing.start.y}
                          x2={routeDrawing.preview.x}
                          y2={routeDrawing.preview.y}
                        />
                        <line
                          className="seating-route-draw-preview__direction"
                          x1={routeDrawing.start.x}
                          y1={routeDrawing.start.y}
                          x2={routeDrawing.preview.x}
                          y2={routeDrawing.preview.y}
                        />
                        <circle className="seating-route-draw-preview__point" cx={routeDrawing.start.x} cy={routeDrawing.start.y} r="13" />
                        <circle className="seating-route-draw-preview__point" cx={routeDrawing.preview.x} cy={routeDrawing.preview.y} r="13" />
                      </>
                    )}
                  </svg>
                  <div className="seating-route-draw-banner" role="status">
                    <strong>{routeDrawing.start ? 'Choose the end point' : 'Choose the start point'}</strong>
                    <span>{routeDrawing.start ? 'Click once, or release after dragging.' : 'Click, or drag from the start to the end.'}</span>
                    <button type="button" onClick={() => setRouteDrawing(null)}>Cancel</button>
                  </div>
                </>
              )}
              {/* Connectors are drawn once, above the blocks, so a route can
                  stretch across the whole room and join any two of them. */}
              <svg
                className="seating-connectors"
                viewBox={`0 0 ${plan.width} ${plan.height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="seating-arrow" markerWidth="16" markerHeight="16" viewBox="0 0 16 16"
                    refX="14" refY="8" orient="auto" markerUnits="userSpaceOnUse"
                  >
                    <path d="M1,1 L15,8 L1,15 Z" fill="#6757d9" />
                  </marker>
                  <marker
                    id="seating-arrow-start" markerWidth="16" markerHeight="16" viewBox="0 0 16 16"
                    refX="2" refY="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"
                  >
                    <path d="M1,1 L15,8 L1,15 Z" fill="#6757d9" />
                  </marker>
                </defs>
                {sections
                  .filter((item) =>
                    item.kind === 'feature' && item.feature === 'path' && (
                      item.path_start_section != null || item.path_start_table != null ||
                      item.path_end_section != null || item.path_end_table != null
                    ))
                  .map((route) => {
                    const geometry = routeGeometry(route, sections)
                    const d = smoothRoutePathD(geometry)
                    const arrows = route.path_arrows ?? 'end'
                    return (
                      <g key={route.id} className={selectedSectionId === route.id ? 'is-selected' : ''}>
                        <path
                          className="seating-connector__edge"
                          d={d}
                          fill="none"
                          stroke="rgba(78, 64, 160, 0.72)"
                          strokeWidth="30"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          className="seating-connector__line"
                          d={d}
                          fill="none"
                          stroke="#f4f1ff"
                          strokeWidth="24"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          className="seating-connector__direction"
                          d={d}
                          fill="none"
                          stroke="#6757d9"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray="12 10"
                          markerEnd={arrows !== 'none' ? 'url(#seating-arrow)' : undefined}
                          markerStart={arrows === 'both' ? 'url(#seating-arrow-start)' : undefined}
                        />
                        {selectedSectionId === route.id && geometry.map((point, index) => (
                          <circle
                            key={index}
                            className={`seating-path__node${selectedPathPoint === index ? ' is-selected' : ''}`}
                            cx={point.x}
                            cy={point.y}
                            r={selectedPathPoint === index ? 13 : 10}
                            onPointerDown={(event) => startConnectorPointDrag(event, route, index)}
                          />
                        ))}
                      </g>
                    )
                  })}
              </svg>

              {sections.map((section) => {
                const size = sectionSize(section)
                // Tables reflow to whatever room the section currently has.
                const layout = tableLayout(section, size)
                const isPath = section.kind === 'feature' && section.feature === 'path'
                // A route with an anchored end is drawn on the plan overlay so
                // it can reach across the room; an unanchored one stays inside
                // its own resizable box.
                const isConnected = isPath && (
                  section.path_start_section != null || section.path_start_table != null ||
                  section.path_end_section != null || section.path_end_table != null
                )
                const localRouteD = isPath
                  ? smoothRoutePathD(routePoints(section).map((point) => ({
                      x: point.x * size.width,
                      y: point.y * size.height,
                    })))
                  : ''
                const seated = section.tables.reduce((sum, table) => sum + (table.assigned ?? 0), 0)
                const seats = section.tables.reduce((sum, table) => sum + table.seats, 0)
                return (
                  <div
                    key={section.id}
                    role="button"
                    tabIndex={0}
                    aria-label={section.kind === 'tables' ? `${section.name} section, ${section.tables.length} tables, ${seats} seats` : section.name}
                    className={[
                      'seating-section',
                      section.kind === 'feature' ? `is-feature is-${section.feature || 'other'}` : '',
                      section.is_reserved ? 'is-reserved' : '',
                      isConnected ? 'is-connected' : '',
                      selectedSectionId === section.id ? 'is-selected' : '',
                    ].filter(Boolean).join(' ')}
                    style={{
                      left: `${(section.x / plan.width) * 100}%`,
                      top: `${(section.y / plan.height) * 100}%`,
                      width: `${(size.width / plan.width) * 100}%`,
                      height: `${(size.height / plan.height) * 100}%`,
                    }}
                    onPointerDown={(event) => startSectionDrag(event, section)}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 30 : 8
                      if (event.key === 'ArrowLeft')  { event.preventDefault(); nudgeSection(section, -step, 0) }
                      if (event.key === 'ArrowRight') { event.preventDefault(); nudgeSection(section, step, 0) }
                      if (event.key === 'ArrowUp')    { event.preventDefault(); nudgeSection(section, 0, -step) }
                      if (event.key === 'ArrowDown')  { event.preventDefault(); nudgeSection(section, 0, step) }
                    }}
                  >
                    <div className="seating-section__head">
                      <span className="seating-section__name" title={section.name}>{section.name}</span>
                      {section.kind === 'tables' && (
                        <span className="seating-section__meta"><b>{seats}</b> seats · {seated} placed</span>
                      )}
                    </div>

                    {section.kind === 'feature' && !isPath && (
                      <span className="seating-section__icon" aria-hidden="true">
                        {featureMeta(section.feature).icon}
                      </span>
                    )}

                    {isPath && !isConnected && (
                      <svg
                        className="seating-path"
                        viewBox={`0 0 ${size.width} ${size.height}`}
                        preserveAspectRatio="none"
                        aria-label={`${section.name}. Drag the orange points to change direction.`}
                      >
                        <defs>
                          <marker
                            id={`seating-path-arrow-${section.id}`}
                            markerWidth="16" markerHeight="16" viewBox="0 0 16 16"
                            refX="14" refY="8" orient="auto" markerUnits="userSpaceOnUse"
                          >
                            <path d="M1,1 L15,8 L1,15 Z" fill="#6757d9" />
                          </marker>
                          <marker
                            id={`seating-path-arrow-start-${section.id}`}
                            markerWidth="16" markerHeight="16" viewBox="0 0 16 16"
                            refX="2" refY="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"
                          >
                            <path d="M1,1 L15,8 L1,15 Z" fill="#6757d9" />
                          </marker>
                        </defs>
                        <path
                          className="seating-path__edge"
                          fill="none"
                          stroke="rgba(78, 64, 160, 0.72)"
                          strokeWidth="36"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d={localRouteD}
                        />
                        <path
                          className="seating-path__line"
                          fill="none"
                          stroke="#f4f1ff"
                          strokeWidth="29"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d={localRouteD}
                        />
                        <path
                          className="seating-path__direction"
                          fill="none"
                          stroke="#6757d9"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray="12 10"
                          markerEnd={(section.path_arrows ?? 'end') !== 'none' ? `url(#seating-path-arrow-${section.id})` : undefined}
                          markerStart={(section.path_arrows ?? 'end') === 'both' ? `url(#seating-path-arrow-start-${section.id})` : undefined}
                          d={localRouteD}
                        />
                        {selectedSectionId === section.id && routePoints(section).map((point, index) => (
                          <circle
                            key={index}
                            className={`seating-path__node${selectedPathPoint === index ? ' is-selected' : ''}`}
                            cx={point.x * size.width}
                            cy={point.y * size.height}
                            r={selectedPathPoint === index ? 13 : 10}
                            role="button"
                            tabIndex={0}
                            aria-label={`${index === 0 ? 'Start' : index === routePoints(section).length - 1 ? 'End' : `Bend ${index}`} point`}
                            onPointerDown={(event) => startPathPointDrag(event, section, index)}
                          />
                        ))}
                      </svg>
                    )}

                    {section.tables.map((table, index) => (
                      <div
                        key={table.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${table.label}, ${table.assigned ?? 0} of ${table.seats} seated`}
                        className={[
                          'seating-table',
                          `seating-table--${table.shape}`,
                          selectedTableId === table.id ? 'is-selected' : '',
                          (table.assigned ?? 0) >= table.seats ? 'is-full' : '',
                        ].filter(Boolean).join(' ')}
                        style={{
                          left: `${((layout.positions[index]?.x ?? table.x) + SECTION_PADDING) / size.width * 100}%`,
                          top: `calc(${SECTION_HEADER}px + ${(layout.positions[index]?.y ?? table.y) / size.height * 100}%)`,
                          width: `${(layout.tableWidth / size.width) * 100}%`,
                          aspectRatio: '1 / 1',
                        }}
                        onPointerDown={(event) => selectTable(event, section, table)}
                      >
                        <span className="seating-table__seats" aria-hidden="true">
                          {Array.from({ length: table.seats }, (_, seatIndex) => {
                            const seatSize = Math.max(3.5, Math.min(9, (Math.PI * layout.tableWidth * 0.82) / Math.max(1, table.seats) / 1.55))
                            return (
                              <i
                                key={seatIndex}
                                className={seatIndex < (table.assigned ?? 0) ? 'is-assigned' : ''}
                                style={{
                                  '--seat-angle': `${(seatIndex / table.seats) * 360}deg`,
                                  '--seat-radius': `${layout.tableWidth * 0.44}px`,
                                  '--seat-size': `${seatSize}px`,
                                } as React.CSSProperties}
                              />
                            )
                          })}
                        </span>
                        <span className="seating-table__surface">
                          <span
                            className="seating-table__label"
                            style={{ fontSize: `${Math.max(0.44, 0.62 * layout.scale)}rem` }}
                          >
                            {table.label}
                          </span>
                          {layout.scale > 0.62 && (
                            <span className="seating-table__count">{table.assigned ?? 0}/{table.seats}</span>
                          )}
                        </span>
                      </div>
                    ))}

                    {section.kind === 'tables' && section.tables.length === 0 && (
                      <p className="seating-section__empty">No tables yet</p>
                    )}

                    <span
                      className="seating-section__resize"
                      role="presentation"
                      title={isPath ? 'Drag to change the route area' : 'Drag to resize this section'}
                      onPointerDown={(event) => startSectionResize(event, section)}
                    />
                  </div>
                )
              })}
              </div>
              <button
                type="button"
                className="seating-canvas__resize"
                aria-label="Resize seating canvas"
                title="Drag to resize the canvas"
                onPointerDown={startCanvasResize}
              />
            </div>
          )}
        </div>

        <aside className="seating-aside">
          <section className="seating-panel seating-panel--canvas">
            <div className="seating-panel__head">
              <h2>Canvas size</h2>
              <button
                type="button"
                className="seating-link"
                onClick={() => void saveCanvasSize(
                  contentBounds.width + PLAN_MARGIN,
                  contentBounds.height + PLAN_MARGIN,
                )}
              >
                Fit plan
              </button>
            </div>
            <p className="seating-muted">Set the venue footprint or drag the orange corner on the map.</p>
            <div className="seating-form seating-form--canvas">
              <div className="seating-form__row">
                <label>
                  <span>Width</span>
                  <input
                    type="number" min={BASE_PLAN_WIDTH} max={MAX_PLAN_SIZE} step={50}
                    value={Math.round(plan.width)}
                    onChange={(event) => setCanvasSize(Number(event.target.value), plan.height)}
                    onBlur={(event) => void saveCanvasSize(Number(event.target.value), plan.height)}
                  />
                </label>
                <label>
                  <span>Height</span>
                  <input
                    type="number" min={BASE_PLAN_HEIGHT} max={MAX_PLAN_SIZE} step={50}
                    value={Math.round(plan.height)}
                    onChange={(event) => setCanvasSize(plan.width, Number(event.target.value))}
                    onBlur={(event) => void saveCanvasSize(plan.width, Number(event.target.value))}
                  />
                </label>
              </div>
            </div>
            {hasClippedContent && (
              <p className="seating-canvas-warning" role="status">
                Some items sit outside this canvas. Use Fit plan to reveal them.
              </p>
            )}
          </section>

          <section className="seating-panel">
            <h2>Add to the plan</h2>
            <div className="seating-tabs" role="tablist">
              <button
                type="button" role="tab"
                aria-selected={draft.kind === 'tables'}
                className={draft.kind === 'tables' ? 'is-active' : ''}
                onClick={() => setDraft({ ...draft, kind: 'tables' })}
              >
                Tables
              </button>
              <button
                type="button" role="tab"
                aria-selected={draft.kind === 'feature'}
                className={draft.kind === 'feature' ? 'is-active' : ''}
                onClick={() => setDraft({ ...draft, kind: 'feature' })}
              >
                Venue feature
              </button>
            </div>

            <form onSubmit={createSection} className="seating-form">
              {draft.kind === 'feature' && (
                <label>
                  <span>Feature</span>
                  <select
                    value={draft.feature}
                    onChange={(event) => {
                      const feature = event.target.value as SeatingFeature
                      // Prefill the name so most features need one click.
                      const meta = featureMeta(feature)
                      setDraft({
                        ...draft,
                        feature,
                        name: draft.name.trim() ? draft.name : meta.label,
                      })
                    }}
                  >
                    {FEATURES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
              )}

              {draft.kind === 'feature' && draft.feature === 'path' && (
                <p className="seating-route-help">
                  Click Draw route, then choose its exact start and end points on the venue plan.
                  You can add bends or connect either end to a table or area afterwards.
                </p>
              )}

              <label>
                <span>{draft.kind === 'feature' ? 'Label' : 'Section name'}</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder={draft.kind === 'feature' ? 'Band, Main entrance…' : 'High table, Grooms family…'}
                  maxLength={80}
                  required
                />
              </label>

              {draft.kind === 'tables' && (
                <>
                  <div className="seating-form__row">
                    <label>
                      <span>Tables</span>
                      <input
                        type="number" min={0} max={60}
                        value={draft.table_count}
                        onChange={(event) => setDraft({ ...draft, table_count: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      <span>Seats each</span>
                      <input
                        type="number" min={1} max={60}
                        value={draft.seats_per_table}
                        onChange={(event) => setDraft({ ...draft, seats_per_table: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                  <div className="seating-form__row">
                    <label>
                      <span>Shape</span>
                      <select
                        value={draft.shape}
                        onChange={(event) => setDraft({ ...draft, shape: event.target.value as SectionDraft['shape'] })}
                      >
                        <option value="round">Round</option>
                        <option value="rectangle">Rectangle</option>
                      </select>
                    </label>
                    <label>
                      <span>Per row</span>
                      <input
                        type="number" min={1} max={10}
                        value={draft.columns}
                        onChange={(event) => setDraft({ ...draft, columns: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                  <label className="seating-check">
                    <input
                      type="checkbox"
                      checked={draft.is_reserved}
                      onChange={(event) => setDraft({ ...draft, is_reserved: event.target.checked })}
                    />
                    <span>Priority zone (high table, family)</span>
                  </label>
                </>
              )}

              <button className="admin-primary-action" disabled={creating || !draft.name.trim()}>
                {creating
                  ? 'Adding…'
                  : draft.kind === 'feature' && draft.feature === 'path'
                    ? 'Draw route'
                    : draft.kind === 'feature' ? 'Add feature' : 'Create section'}
              </button>
            </form>
          </section>

          {selectedSection && (
            <section className="seating-panel">
              <div className="seating-panel__head">
                <h2>{selectedSection.name}</h2>
                <button className="seating-link-danger" onClick={removeSection}>Remove</button>
              </div>
              <p className="seating-muted">
                {selectedSection.kind === 'feature'
                  ? featureMeta(selectedSection.feature).label
                  : `${selectedSection.tables.length} table${selectedSection.tables.length === 1 ? '' : 's'} · labels start ${selectedSection.prefix}-01`}
              </p>
              {selectedSection.feature === 'path' && (
                <>
                  <p className="seating-route-help">
                    Drag the orange points to shape a smooth, free-form curve. Add more
                    curve points for tighter or more detailed turns. Connect either end to a
                    block below and it will follow that block when you move it.
                  </p>

                  <div className="seating-form">
                    <label>
                      <span>Starts at</span>
                      <select
                        value={connectorValue(selectedSection, 'start')}
                        onChange={(event) => setConnector(selectedSection, 'start', event.target.value)}
                      >
                        <option value="">Free — drag to place</option>
                        {connectorTargets(selectedSection).map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Ends at</span>
                      <select
                        value={connectorValue(selectedSection, 'end')}
                        onChange={(event) => setConnector(selectedSection, 'end', event.target.value)}
                      >
                        <option value="">Free — drag to place</option>
                        {connectorTargets(selectedSection).map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Arrows</span>
                      <select
                        value={selectedSection.path_arrows ?? 'end'}
                        onChange={(event) =>
                          updateSection({ path_arrows: event.target.value as SeatingSection['path_arrows'] })
                        }
                      >
                        <option value="end">At the end</option>
                        <option value="both">Both ends</option>
                        <option value="none">No arrows</option>
                      </select>
                    </label>
                  </div>
                </>
              )}

              <div className="seating-form">
                <label>
                  <span>Name</span>
                  <input
                    value={selectedSection.name}
                    onChange={(event) =>
                      setSections((current) =>
                        current.map((item) =>
                          item.id === selectedSection.id ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                    onBlur={(event) => {
                      const name = event.target.value.trim()
                      if (name && name !== selectedSection.name) updateSection({ name })
                    }}
                    maxLength={80}
                  />
                </label>
                {selectedSection.kind === 'tables' && (
                  <label className="seating-check">
                    <input
                      type="checkbox"
                      checked={selectedSection.is_reserved}
                      onChange={(event) => updateSection({ is_reserved: event.target.checked })}
                    />
                    <span>Priority zone</span>
                  </label>
                )}

                <div className="seating-form__row">
                  <label>
                    <span>Width</span>
                    <input
                      type="number" min={MIN_SECTION.width} max={4000} step={10}
                      value={Math.round(sectionSize(selectedSection).width)}
                      onChange={(event) => {
                        const width = Math.max(MIN_SECTION.width, Number(event.target.value))
                        setSections((current) =>
                          current.map((item) => (item.id === selectedSection.id ? { ...item, width } : item)),
                        )
                      }}
                      onBlur={(event) => updateSection({
                        width: Math.max(MIN_SECTION.width, Number(event.target.value)),
                      })}
                    />
                  </label>
                  <label>
                    <span>Height</span>
                    <input
                      type="number" min={MIN_SECTION.height} max={4000} step={10}
                      value={Math.round(sectionSize(selectedSection).height)}
                      onChange={(event) => {
                        const height = Math.max(MIN_SECTION.height, Number(event.target.value))
                        setSections((current) =>
                          current.map((item) => (item.id === selectedSection.id ? { ...item, height } : item)),
                        )
                      }}
                      onBlur={(event) => updateSection({
                        height: Math.max(MIN_SECTION.height, Number(event.target.value)),
                      })}
                    />
                  </label>
                </div>
              </div>

              <div className="seating-actions-row">
                {selectedSection.kind === 'tables' && (
                  <>
                    <button className="admin-secondary-action" onClick={() => addTables(1)}>+ 1 table</button>
                    <button className="admin-secondary-action" onClick={() => addTables(5)}>+ 5 tables</button>
                    <button className="admin-secondary-action" onClick={relayout}>Tidy</button>
                  </>
                )}
                {selectedSection.feature === 'path' && (
                  <>
                    <button
                      className="admin-secondary-action"
                      onClick={() => addPathBend(selectedSection)}
                      disabled={routePoints(selectedSection).length >= 32}
                    >
                      + Curve point
                    </button>
                    <button
                      className="admin-secondary-action"
                      onClick={() => removePathBend(selectedSection)}
                      disabled={
                        selectedPathPoint == null
                        || selectedPathPoint === 0
                        || selectedPathPoint === routePoints(selectedSection).length - 1
                      }
                      title="Select an orange bend point first"
                    >
                      Remove point
                    </button>
                    <button className="admin-secondary-action" onClick={() => straightenPath(selectedSection)}>
                      Straighten
                    </button>
                  </>
                )}
                <button
                  className="admin-secondary-action"
                  onClick={() => updateSection({ width: null, height: null })}
                  title="Shrink the section back around its tables"
                >
                  Fit
                </button>
              </div>
            </section>
          )}

          {selectedTable ? (
            <section className="seating-panel">
              <div className="seating-panel__head">
                <h2>{selectedTable.label}</h2>
                <button className="seating-link-danger" onClick={() => removeTable(selectedTable)}>Remove</button>
              </div>

              <div className="seating-form">
                <div className="seating-form__row">
                  <label>
                    <span>Shape</span>
                    <select
                      value={selectedTable.shape}
                      onChange={(event) => {
                        const shape = event.target.value as SeatingTable['shape']
                        patchTable(selectedTable, { shape })
                        saveTable(selectedTable, { shape })
                      }}
                    >
                      <option value="round">Round</option>
                      <option value="rectangle">Rectangle</option>
                    </select>
                  </label>
                  <label>
                    <span>Seats</span>
                    <input
                      type="number" min={1} max={60}
                      value={selectedTable.seats}
                      onChange={(event) => patchTable(selectedTable, { seats: Number(event.target.value) })}
                      onBlur={(event) => saveTable(selectedTable, { seats: Number(event.target.value) })}
                    />
                  </label>
                </div>
              </div>

              <div className="seating-guests">
                <h3>Seated · {seating?.assigned.length ?? 0}/{selectedTable.seats}</h3>
                {seatingLoading ? (
                  <p className="seating-muted">Loading…</p>
                ) : seating && seating.assigned.length > 0 ? (
                  <ul className="seating-guest-list">
                    {seating.assigned.map((guest) => (
                      <li key={guest.id}>
                        <span>
                          {guest.full_name}
                          {guest.seat_number && <small>Seat {guest.seat_number}</small>}
                        </span>
                        <button onClick={() => unseatGuest(guest.id)} aria-label={`Remove ${guest.full_name}`}>×</button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="seating-muted">Nobody seated here yet.</p>
                )}

                <h3>Unseated guests</h3>
                {seating && seating.unassigned.length > 0 ? (
                  <ul className="seating-guest-list seating-guest-list--add">
                    {seating.unassigned.slice(0, 40).map((guest) => (
                      <li key={guest.id}>
                        <span>{guest.full_name}</span>
                        <button
                          onClick={() => seatGuest(guest.id)}
                          disabled={(seating.assigned.length ?? 0) >= selectedTable.seats}
                          aria-label={`Seat ${guest.full_name}`}
                        >
                          +
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="seating-muted">Everyone has a table.</p>
                )}
              </div>
            </section>
          ) : (
            <section className="seating-panel seating-panel--hint">
              <p>Select a table to seat guests at it.</p>
              <p className="seating-muted">Drag a section or feature to move it. Select a route to reveal its bend points.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
