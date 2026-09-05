'use client'

import Link from 'next/link'
import { useState } from 'react'

const links = [
  ['How it works', '#product'],
  ['Workflow', '#workflow'],
  ['Features', '#features'],
  ['Who it is for', '#about'],
]

export function LandingNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="landing-nav">
      <div className="landing-shell landing-nav__inner">
        <Link href="/" className="landing-brand" aria-label="Event Pro home">
          <span className="landing-logo">EP</span>
          <strong>Event Pro</strong>
        </Link>

        <nav
          id="landing-menu"
          className={`landing-nav__links${open ? ' is-open' : ''}`}
          aria-label="Main navigation"
        >
          {links.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>
          ))}
        </nav>

        <div className="landing-nav__actions">
          <Link href="/login" className="landing-sign-in">Sign in</Link>
          <Link href="/signup" className="landing-button landing-button--small" data-cta="nav-signup">
            Create workspace <span aria-hidden="true">→</span>
          </Link>
          <button
            type="button"
            className="landing-menu-button"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-controls="landing-menu"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <span aria-hidden="true">{open ? '×' : '☰'}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
