/**
 * Illustrations for the "What we do" capability cards.
 *
 * Each drawing is a simplified vector reproduction of the matching admin
 * screen, so the landing page shows what the product actually looks like:
 * the guestbook list, the guest RSVP form, the seating plan, and the
 * WhatsApp delivery table. They are inline SVG rather than screenshots so
 * they stay sharp, cost no requests, and follow the active landing palette
 * through the --landing-* custom properties.
 */

type CapabilityArtProps = {
  /** Card number from the capabilities list — selects the matching drawing. */
  variant: '01' | '02' | '03' | '04' | '05'
}

/** Shared canvas: every drawing is authored against the same 280x170 box. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="capability-art"
      viewBox="0 0 280 170"
      role="img"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {children}
    </svg>
  )
}

/** The window chrome every admin screen sits inside. */
function Window({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <rect className="art-window" x="8" y="10" width="264" height="150" rx="10" />
      <path className="art-window-bar" d="M8 20a10 10 0 0 1 10-10h244a10 10 0 0 1 10 10v12H8V20Z" />
      <circle className="art-dot" cx="21" cy="21" r="2.6" />
      <circle className="art-dot" cx="30" cy="21" r="2.6" />
      <circle className="art-dot" cx="39" cy="21" r="2.6" />
      <text className="art-title" x="50" y="24.5">{title}</text>
      {children}
    </>
  )
}

/**
 * 01 — Guestbook list: the real admin table with a stats strip, search field,
 * initials avatars, and IN / PENDING status pills.
 */
function GuestIntelligence() {
  const rows = [
    { initials: 'AO', name: 62, meta: 'T-04', status: 'in' },
    { initials: 'TB', name: 74, meta: 'T-04', status: 'pending' },
    { initials: 'CN', name: 54, meta: 'T-11', status: 'in' },
    { initials: 'FA', name: 68, meta: 'T-07', status: 'in' },
  ]

  return (
    <Frame>
      <Window title="Guestbook">
        {/* Stats strip — checked in / pending / total. */}
        <g transform="translate(18 40)">
          {[
            { x: 0, w: 76, accent: true },
            { x: 84, w: 76, accent: false },
            { x: 168, w: 76, accent: false },
          ].map((tile) => (
            <g key={tile.x} transform={`translate(${tile.x} 0)`}>
              <rect className="art-tile" x="0" y="0" width={tile.w} height="26" rx="6" />
              <rect className="art-line-faint" x="9" y="7" width="26" height="4" rx="2" />
              <rect
                className={tile.accent ? 'art-stat-accent' : 'art-stat'}
                x="9"
                y="15"
                width="18"
                height="6"
                rx="3"
              />
            </g>
          ))}
        </g>

        {/* Search / filter bar. */}
        <g transform="translate(18 74)">
          <rect className="art-input" x="0" y="0" width="172" height="16" rx="8" />
          <circle className="art-ring-muted" cx="12" cy="8" r="3.6" fill="none" strokeWidth="1.4" />
          <path className="art-ring-muted" d="m15 11 2.4 2.4" fill="none" strokeWidth="1.4" strokeLinecap="round" />
          <rect className="art-line-faint" x="23" y="5.5" width="44" height="5" rx="2.5" />
          <rect className="art-chip-accent" x="180" y="0" width="44" height="16" rx="8" />
        </g>

        {/* Guest rows. */}
        {rows.map((row, index) => (
          <g key={row.initials} transform={`translate(18 ${98 + index * 15})`}>
            <circle className="art-avatar" cx="9" cy="7" r="6.6" />
            <text className="art-initials" x="9" y="9.4">{row.initials}</text>
            <rect className="art-line" x="21" y="4" width={row.name} height="5.5" rx="2.75" />
            <text className="art-meta" x={21 + row.name + 8} y="9.2">{row.meta}</text>
            <rect
              className={row.status === 'in' ? 'art-pill-in' : 'art-pill-pending'}
              x="196"
              y="1.5"
              width={row.status === 'in' ? 20 : 34}
              height="11"
              rx="2"
            />
            <text
              className={row.status === 'in' ? 'art-pill-in-text' : 'art-pill-pending-text'}
              x={row.status === 'in' ? 206 : 213}
              y="9.6"
            >
              {row.status === 'in' ? 'IN' : 'PENDING'}
            </text>
          </g>
        ))}
      </Window>
    </Frame>
  )
}

/**
 * 02 — RSVP response form: the guest-facing screen with Yes/No answer,
 * meal choice, and the Aso Ebi yard request.
 */
function SmartRsvp() {
  return (
    <Frame>
      <Window title="RSVP response">
        {/* Question. */}
        <g transform="translate(20 42)">
          <rect className="art-line" x="0" y="0" width="86" height="6" rx="3" />
          <rect className="art-line-faint" x="0" y="11" width="58" height="5" rx="2.5" />
        </g>

        {/* Yes / No — Yes is chosen. */}
        <g transform="translate(20 66)">
          <rect className="art-answer-active" x="0" y="0" width="112" height="24" rx="7" />
          <circle className="art-accent" cx="15" cy="12" r="6.4" />
          <path
            className="art-tick"
            d="m12.3 12.1 2 2 4.2-4.4"
            fill="none"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text className="art-answer-label" x="29" y="15.4">Attending</text>

          <rect className="art-answer" x="120" y="0" width="112" height="24" rx="7" />
          <circle className="art-ring-muted" cx="135" cy="12" r="6.4" fill="none" strokeWidth="1.5" />
          <text className="art-answer-label-muted" x="149" y="15.4">Cannot make it</text>
        </g>

        {/* Meal choice chips — chicken selected. */}
        <g transform="translate(20 100)">
          <rect className="art-line-faint" x="0" y="0" width="40" height="4.5" rx="2.25" />
          <rect className="art-chip-outline-active" x="0" y="9" width="52" height="17" rx="8.5" />
          <text className="art-chip-text-active" x="26" y="20.6">Chicken</text>
          <rect className="art-chip-outline" x="58" y="9" width="46" height="17" rx="8.5" />
          <text className="art-chip-text" x="81" y="20.6">Fish</text>
          <rect className="art-chip-outline" x="110" y="9" width="62" height="17" rx="8.5" />
          <text className="art-chip-text" x="141" y="20.6">Vegetarian</text>
        </g>

        {/* Aso Ebi request with yard count. */}
        <g transform="translate(20 134)">
          <rect className="art-aso" x="0" y="0" width="232" height="20" rx="7" />
          <circle className="art-accent-warm" cx="14" cy="10" r="5.6" />
          <path
            className="art-tick-warm"
            d="m11.6 10.1 1.8 1.8 3.6-3.9"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text className="art-aso-label" x="26" y="13.4">Aso Ebi</text>
          <rect className="art-yards" x="180" y="4" width="42" height="12" rx="6" />
          <text className="art-yards-text" x="201" y="12.8">5 yards</text>
        </g>
      </Window>
    </Frame>
  )
}

/**
 * 03 — Event planner: round tables with seats, a filled table, a reserved
 * priority zone, and the T-04 tag used across the admin.
 */
function SeatingPlans() {
  const tables = [
    { cx: 58, cy: 84, filled: 8, label: 'T-01', active: false },
    { cx: 140, cy: 88, filled: 8, label: 'T-04', active: true },
    { cx: 222, cy: 84, filled: 5, label: 'T-07', active: false },
    { cx: 99, cy: 138, filled: 6, label: 'T-02', active: false },
    { cx: 181, cy: 138, filled: 3, label: 'T-09', active: false },
  ]

  return (
    <Frame>
      <Window title="Event planner">
        {/* Stage / head table marker. */}
        <g transform="translate(100 38)">
          <rect className="art-stage" x="0" y="0" width="80" height="15" rx="7.5" />
          <text className="art-stage-text" x="40" y="10.4">HIGH TABLE</text>
        </g>

        {tables.map((table) => (
          <g key={table.label}>
            {Array.from({ length: 8 }).map((_, seat) => {
              const angle = (seat / 8) * Math.PI * 2 - Math.PI / 2
              return (
                <circle
                  key={seat}
                  className={
                    seat >= table.filled
                      ? 'art-seat-empty'
                      : table.active
                        ? 'art-seat-active'
                        : 'art-seat'
                  }
                  cx={table.cx + Math.cos(angle) * 19}
                  cy={table.cy + Math.sin(angle) * 19}
                  r="3.7"
                />
              )
            })}
            <circle
              className={table.active ? 'art-table-active' : 'art-table'}
              cx={table.cx}
              cy={table.cy}
              r="12.5"
            />
            <text
              className={table.active ? 'art-table-label-active' : 'art-table-label'}
              x={table.cx}
              y={table.cy + 3.1}
            >
              {table.label}
            </text>
          </g>
        ))}
      </Window>
    </Frame>
  )
}

/**
 * 04 — WhatsApp delivery: the admin send table with per-guest delivery
 * status, plus a template preview bubble.
 */
function WhatsappOperations() {
  const rows = [
    { name: 56, status: 'sent' },
    { name: 68, status: 'sent' },
    { name: 48, status: 'queued' },
    { name: 62, status: 'sent' },
  ]

  return (
    <Frame>
      <Window title="Guest messages">
        {/* Template preview bubble. */}
        <g transform="translate(18 40)">
          <rect className="art-bubble-out" x="0" y="0" width="122" height="44" rx="9" />
          <rect className="art-line-on-accent" x="11" y="10" width="84" height="5" rx="2.5" />
          <rect className="art-line-on-accent-faint" x="11" y="20" width="62" height="4.5" rx="2.25" />
          <rect className="art-line-on-accent-faint" x="11" y="29" width="44" height="4.5" rx="2.25" />
          {/* Double-tick delivery receipt inside the bubble. */}
          <path
            className="art-tick-receipt"
            d="m100 33.5 2.4 2.4 5-5.4"
            fill="none"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className="art-tick-receipt"
            d="m105.5 33.5 2.4 2.4 5-5.4"
            fill="none"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Send progress. */}
        <g transform="translate(18 94)">
          <rect className="art-line-faint" x="0" y="0" width="52" height="4.5" rx="2.25" />
          <rect className="art-track" x="0" y="9" width="122" height="7" rx="3.5" />
          <rect className="art-track-fill" x="0" y="9" width="98" height="7" rx="3.5" />
        </g>

        {/* Delivery table — WA Sent column. */}
        <g transform="translate(152 40)">
          <rect className="art-tile" x="0" y="0" width="110" height="112" rx="8" />
          <rect className="art-line-faint" x="11" y="11" width="40" height="4.5" rx="2.25" />
          <line className="art-divider" x1="11" y1="23" x2="99" y2="23" strokeWidth="1" />
          {rows.map((row, index) => (
            <g key={index} transform={`translate(11 ${31 + index * 20})`}>
              <circle className="art-avatar-sm" cx="6" cy="6" r="5.4" />
              <rect className="art-line" x="17" y="3.4" width={row.name * 0.5} height="4.6" rx="2.3" />
              {row.status === 'sent' ? (
                <g transform="translate(72 2)">
                  <path
                    className="art-tick-sent"
                    d="m0 4.4 2.2 2.2 4.6-5"
                    fill="none"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    className="art-tick-sent"
                    d="m5 4.4 2.2 2.2 4.6-5"
                    fill="none"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ) : (
                <circle
                  className="art-ring-warm"
                  cx="80"
                  cy="6"
                  r="4.4"
                  fill="none"
                  strokeWidth="1.6"
                  strokeDasharray="2.2 2"
                />
              )}
            </g>
          ))}
        </g>
      </Window>
    </Frame>
  )
}


/**
 * 05 — Door desk: a guest's pass being scanned, with the phone viewfinder on
 * the left and the admitted result on the right.
 */
function DoorScanning() {
  return (
    <Frame>
      <Window title="Door desk">
        {/* Phone viewfinder with the QR in frame. */}
        <g transform="translate(24 40)">
          <rect className="art-tile" x="0" y="0" width="104" height="110" rx="10" />

          {/* Corner brackets. */}
          <path className="art-bracket" d="M16 30v-8a4 4 0 0 1 4-4h8" fill="none" strokeWidth="2" strokeLinecap="round" />
          <path className="art-bracket" d="M76 18h8a4 4 0 0 1 4 4v8" fill="none" strokeWidth="2" strokeLinecap="round" />
          <path className="art-bracket" d="M88 78v8a4 4 0 0 1-4 4h-8" fill="none" strokeWidth="2" strokeLinecap="round" />
          <path className="art-bracket" d="M28 90h-8a4 4 0 0 1-4-4v-8" fill="none" strokeWidth="2" strokeLinecap="round" />

          {/* The QR code itself — finder squares plus a scatter of modules. */}
          <g transform="translate(30 32)">
            <rect className="art-qr-bg" x="0" y="0" width="44" height="44" rx="3" />
            {[[3, 3], [30, 3], [3, 30]].map(([qx, qy]) => (
              <g key={`${qx}-${qy}`}>
                <rect className="art-qr" x={qx} y={qy} width="11" height="11" rx="2" />
                <rect className="art-qr-bg" x={qx + 3} y={qy + 3} width="5" height="5" rx="1" />
              </g>
            ))}
            {[
              [18, 5], [22, 9], [18, 13], [26, 5], [22, 17],
              [30, 20], [36, 24], [18, 24], [26, 28], [33, 33],
              [22, 36], [30, 40], [38, 36], [18, 33], [40, 29],
            ].map(([mx, my]) => (
              <rect key={`${mx}-${my}`} className="art-qr" x={mx} y={my} width="4" height="4" rx="0.8" />
            ))}
          </g>

          {/* Scan line sweeping the code. */}
          <rect className="art-scanline" x="14" y="53" width="76" height="2.4" rx="1.2" />
        </g>

        {/* Result card — the guest was found and admitted. */}
        <g transform="translate(146 40)">
          <rect className="art-card-panel" x="0" y="0" width="110" height="110" rx="10" />

          <circle className="art-admit" cx="55" cy="30" r="15" />
          <path
            className="art-tick"
            d="m48.5 30.2 4.4 4.4 9-9.4"
            fill="none"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <text className="art-admit-text" x="55" y="58">ADMITTED</text>

          <line className="art-divider" x1="14" y1="68" x2="96" y2="68" strokeWidth="1" />

          {/* Guest name, table and ticket type. */}
          <rect className="art-line" x="20" y="76" width="52" height="5.5" rx="2.75" />
          <rect className="art-pill-in" x="20" y="88" width="26" height="12" rx="2" />
          <text className="art-pill-in-text" x="33" y="96.6">T-04</text>
          <rect className="art-chip-soft" x="52" y="88" width="38" height="12" rx="2" />
          <text className="art-chip-soft-text" x="71" y="96.6">REGULAR</text>
        </g>
      </Window>
    </Frame>
  )
}

const drawings = {
  '01': GuestIntelligence,
  '02': SmartRsvp,
  '03': SeatingPlans,
  '04': WhatsappOperations,
  '05': DoorScanning,
} as const

export default function CapabilityArt({ variant }: CapabilityArtProps) {
  const Drawing = drawings[variant]
  return <Drawing />
}
