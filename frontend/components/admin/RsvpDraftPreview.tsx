'use client'

import type { CSSProperties } from 'react'
import type { Event, EventRsvpCustomization } from '@/lib/api'

/** Presentation-only preview: it never loads a guest or submits an RSVP. */
export function RsvpDraftPreview({ draft, event, organizationName }: {
  draft: EventRsvpCustomization
  event?: Event
  organizationName: string
}) {
  const style = {
    '--font-sans': 'var(--font-public-sans)',
    '--font-display': 'var(--font-public-display)',
    '--text-xs': '.75rem',
    '--text-sm': '.875rem',
    fontFamily: 'var(--font-sans)',
    '--bg': draft.rsvp_background_color,
    '--panel': draft.rsvp_card_color,
    '--ink': draft.rsvp_text_color,
    '--brand': draft.rsvp_primary_color,
    '--brand-soft': `color-mix(in srgb, ${draft.rsvp_primary_color} 16%, transparent)`,
    '--line': `color-mix(in srgb, ${draft.rsvp_text_color} 16%, transparent)`,
    color: 'var(--ink)',
    backgroundColor: 'var(--bg)',
    backgroundImage: draft.rsvp_background_image ? `url("${draft.rsvp_background_image}")` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  } as CSSProperties

  return <section className="admin-surface" aria-labelledby="rsvp-draft-preview-heading">
    <div className="border-b border-[var(--line)] px-5 py-4">
      <h2 id="rsvp-draft-preview-heading" className="text-base font-semibold">Draft preview</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Changes appear here before publishing. Guest-specific artwork and questions may vary.</p>
    </div>
    <div className="p-4 sm:p-8" style={style}>
      <div className="mx-auto max-w-2xl overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--panel)] shadow-lg">
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
          {draft.rsvp_logo
            ? <img src={draft.rsvp_logo} alt={`${organizationName} logo preview`} className="h-9 w-9 rounded-lg object-contain" />
            : <span className="flex h-9 w-9 items-center justify-center rounded-lg font-bold text-white" style={{ background: 'var(--brand)' }}>{organizationName.charAt(0).toUpperCase()}</span>}
          <div><p className="text-sm font-semibold">{organizationName}</p><p className="text-xs">RSVP</p></div>
        </div>
        <div className="p-5 sm:p-7">
          {draft.rsvp_hero_image
            ? <img src={draft.rsvp_hero_image} alt={`${draft.name} cover preview`} className="mb-6 h-auto w-full rounded-xl" />
            : <div className="mb-6 rounded-xl px-5 py-8 text-center" style={{ background: 'var(--brand-soft)' }}><p className="text-xs font-semibold tracking-widest">RSVP</p><h3 className="mt-3 text-2xl font-bold">{draft.name}</h3></div>}
          <h3 className="text-lg font-bold">Event Details</h3>
          {event && <div className="mt-4 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4 text-sm sm:grid-cols-3">
            <div><p className="text-xs">Date</p><p className="mt-1 font-semibold">{new Date(event.date).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
            <div><p className="text-xs">Time (WAT)</p><p className="mt-1 font-semibold">{new Date(event.date).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit', hour12: true })}</p></div>
            {event.venue && <div><p className="text-xs">Venue</p><p className="mt-1 font-semibold">{event.venue}</p></div>}
          </div>}
          <p className="mt-6 whitespace-pre-line text-sm leading-7">{draft.rsvp_message || 'Welcome. You are warmly invited to this special occasion. Please review the event details below and kindly confirm your availability.'}</p>
          {draft.color_of_day && <div className="mt-4 rounded-xl border border-[var(--line)] px-4 py-4" style={{ background: 'var(--brand-soft)', boxShadow: 'inset 3px 0 0 var(--brand)' }}><p className="text-xs font-semibold">Colour of the day</p><p className="mt-1 break-words text-lg font-bold">{draft.color_of_day}</p></div>}
          <div className="mt-7 border-t border-[var(--line)] pt-6 text-center">
            <p className="text-base font-semibold">Hi Sample Guest, are you attending?</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-hidden="true">
              <span className="rounded-lg px-4 py-3 text-sm font-semibold text-white" style={{ background: 'var(--brand)' }}>Yes, I’m Coming</span>
              <span className="rounded-lg border border-[var(--line)] px-4 py-3 text-sm font-semibold">No, I Can’t Make It</span>
            </div>
            <p className="mt-3 text-xs">Preview only — no response will be recorded.</p>
          </div>
        </div>
      </div>
    </div>
  </section>
}
