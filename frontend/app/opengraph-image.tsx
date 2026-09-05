import { ImageResponse } from 'next/og'

export const alt = 'Event Pro — Plan with clarity. Host with confidence.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          background: '#171522',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif',
          padding: '72px 80px',
        }}
      >
        <div style={{ display: 'flex', position: 'absolute', width: 520, height: 520, borderRadius: 999, background: '#6757d9', right: -140, top: -180, opacity: 0.78 }} />
        <div style={{ display: 'flex', position: 'absolute', width: 300, height: 300, borderRadius: 999, background: '#ee7651', right: 40, bottom: -185, opacity: 0.82 }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 25, fontWeight: 700 }}>
            <div style={{ display: 'flex', width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, background: '#ffffff', color: '#171522', fontSize: 18 }}>EP</div>
            Event Pro
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 850 }}>
            <div style={{ display: 'flex', color: '#c8befd', fontSize: 20, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 20 }}>The event operating system</div>
            <div style={{ display: 'flex', fontSize: 72, lineHeight: 1.02, letterSpacing: -4, fontWeight: 750 }}>Plan with clarity.<br />Host with confidence.</div>
            <div style={{ display: 'flex', marginTop: 25, color: '#b8b1c2', fontSize: 24 }}>Every guest and every detail, in one calm command centre.</div>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
