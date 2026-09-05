import Link from 'next/link'

const footerLinks = [
  {
    title: 'Platform',
    links: [
      ['What we do', '#product'],
      ['Features', '#features'],
      ['How it works', '#workflow'],
      ['Create workspace', '/signup'],
      ['Sign in', '/login'],
    ],
  },
  {
    title: 'Built for',
    links: [
      ['Event agencies', '#about'],
      ['Independent planners', '#about'],
      ['Venues & teams', '#about'],
      ['Enterprise events', '#about'],
    ],
  },
]

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-shell landing-footer__grid">
        <div className="landing-footer__brand">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Event Pro home">
            <div className="landing-logo landing-logo--footer">EP</div>
            <span>Event Pro</span>
          </Link>
          <p>The calm command centre for modern event and guest operations.</p>
          <span className="landing-footer__status"><i /> Workspace signup is available</span>
        </div>

        {footerLinks.map((group) => (
          <div key={group.title} className="landing-footer__links">
            <p>{group.title}</p>
            {group.links.map(([label, href]) => <Link key={label} href={href}>{label}</Link>)}
          </div>
        ))}

        <div className="landing-footer__note">
          <p>From invitation to arrival</p>
          <strong>Every guest deserves a thoughtful welcome.</strong>
        </div>
      </div>
      <div className="landing-shell landing-footer__bottom">
        <p>© 2026 Event Pro. Built for the people behind the experience.</p>
        <div><Link href="/signup">Create workspace</Link><Link href="/login">Sign in</Link></div>
      </div>
    </footer>
  )
}
