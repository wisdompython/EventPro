import Link from 'next/link'
import { LandingNav } from '@/components/landing/LandingNav'
import { LandingFooter } from '@/components/landing/LandingFooter'
import CapabilityArt from '@/components/landing/CapabilityArt'
import './landing.css'

const capabilities = [
  {
    number: '01' as const,
    art: '02' as const,
    title: 'Invite and collect',
    copy: 'Give every guest a personal response link and keep attendance, meal choices, dietary needs, plus-ones, aso-ebi requests, and notes in one record.',
    tag: 'RSVP and preferences',
    points: [
      'No guest app or account required',
      'Approved WhatsApp invitations and reminders',
      'Responses update the guest list automatically',
    ],
  },
  {
    number: '02' as const,
    art: '03' as const,
    title: 'Seat and coordinate',
    copy: 'Turn the guest list into a practical venue plan. Map entrances, car parks, routes, zones, and table blocks, then keep assignments visible to the people running the event.',
    tag: 'Event planning and operations',
    points: [
      'Map routes and areas from the gate inward',
      'Keep households and priority guests together',
      'Spot unseated guests before doors open',
    ],
  },
  {
    number: '03' as const,
    art: '05' as const,
    title: 'Welcome and check in',
    copy: 'Send branded QR passes and give the door team the guest name, access level, table, and arrival status the moment a pass is scanned.',
    tag: 'Passes and arrival',
    points: [
      'Scan from a phone without printed lists',
      'Check in a guest and their plus-one together',
      'Prevent accidental duplicate entry',
    ],
  },
]

const workflow = [
  ['01', 'Build', 'Import a list or add guests as you go'],
  ['02', 'Invite', 'Send the right approved WhatsApp message'],
  ['03', 'Collect', 'Capture attendance and guest choices'],
  ['04', 'Arrange', 'Assign tables, zones, and access'],
  ['05', 'Welcome', 'Scan passes and track arrivals'],
]

export default function HomePage() {
  return (
    <main className="landing-page">
      <a className="landing-skip-link" href="#main-content">Skip to main content</a>
      <LandingNav />

      <div id="main-content">
        <section className="landing-hero">
          <div className="landing-orb landing-orb--one" aria-hidden="true" />
          <div className="landing-orb landing-orb--two" aria-hidden="true" />
          <div className="landing-shell landing-hero__grid">
            <div className="landing-hero__copy">
              <div className="landing-eyebrow">
                <span aria-hidden="true" /> Built for teams who run the room
              </div>
              <h1>Manage every guest—<em>from WhatsApp invitation to door check-in.</em></h1>
              <p className="landing-lead">
                Event Pro keeps RSVPs, preferences, seating, branded passes,
                WhatsApp delivery, and arrival status together in one calm workspace.
              </p>
              <div className="landing-actions">
                <Link href="/signup" className="landing-button" data-cta="hero-signup">
                  Create your workspace <span aria-hidden="true">→</span>
                </Link>
                <a href="#product" className="landing-button landing-button--ghost">
                  See how it works
                </a>
              </div>
              <div className="landing-audience" aria-label="Designed for">
                <span>Event agencies</span><i aria-hidden="true" />
                <span>Independent planners</span><i aria-hidden="true" />
                <span>Venues and event teams</span>
              </div>
            </div>

            <div className="product-preview" aria-label="Preview of the Event Pro operations dashboard">
              <div className="product-preview__topbar">
                <div className="product-preview__brand"><span>EP</span> Event Pro</div>
                <div className="product-preview__live"><i aria-hidden="true" /> Live operations</div>
              </div>
              <div className="product-preview__body">
                <aside className="product-preview__sidebar" aria-hidden="true">
                  <b>⌂</b><span>♙</span><span>◫</span><span>✓</span>
                </aside>
                <div className="product-preview__content">
                  <div className="preview-heading">
                    <div><small>Saturday, 18 October</small><h2>Amina &amp; Tobi</h2></div>
                    <span className="preview-status">On track</span>
                  </div>
                  <div className="preview-metrics">
                    <div><small>Guests</small><strong>428</strong><span>18 added this week</span></div>
                    <div><small>Confirmed</small><strong>362</strong><span>85% response</span></div>
                    <div><small>Tables ready</small><strong>31/36</strong><span>5 need review</span></div>
                  </div>
                  <div className="preview-panels">
                    <div className="preview-chart">
                      <div className="preview-panel-title"><b>Guest readiness</b><span>This week</span></div>
                      <div className="preview-bars" aria-hidden="true">
                        {[36, 52, 44, 68, 58, 82, 92].map((height, index) => (
                          <i key={index} style={{ height: `${height}%` }} />
                        ))}
                      </div>
                      <div className="preview-chart-labels"><span>Mon</span><span>Sun</span></div>
                    </div>
                    <div className="preview-tasks">
                      <div className="preview-panel-title"><b>Today</b><span>3 tasks</span></div>
                      <p><i className="done">✓</i><span>Menu choices closed<small>362 responses</small></span></p>
                      <p><i>2</i><span>Review priority seating<small>Royal table</small></span></p>
                      <p><i>3</i><span>Send final reminder<small>66 guests</small></span></p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="preview-float preview-float--meal">
                <span aria-hidden="true">🍽</span><div><small>Meal choices</small><b>94% complete</b></div>
              </div>
              <div className="preview-float preview-float--checkin">
                <span aria-hidden="true">✓</span><div><small>Check-in</small><b>Ready on 4 devices</b></div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-proof" aria-label="Product capabilities">
          <div className="landing-shell landing-proof__grid">
            <p>Built for live guest operations</p>
            <div><strong>One guest record</strong><span>RSVP, seating, passes, and arrival status stay connected.</span></div>
            <div><strong>WhatsApp-first</strong><span>Reach guests in the channel they already use.</span></div>
            <div><strong>Door-ready</strong><span>Give every check-in device the same live information.</span></div>
          </div>
        </section>

        <section id="product" className="landing-section landing-section--product">
          <div className="landing-shell">
            <div className="landing-section-heading landing-section-heading--split">
              <div>
                <p className="landing-kicker">One connected guest journey</p>
                <h2>No disconnected lists.<br /><em>No last-minute guesswork.</em></h2>
              </div>
              <p>
                Each update stays with the guest, so the planning team and the
                door team work from the same information.
              </p>
            </div>

            <div className="capability-rows">
              {capabilities.map((capability) => (
                <article key={capability.number} className="capability-row">
                  <div className="capability-row__copy">
                    <div className="capability-row__label">
                      <span>{capability.number}</span>
                      <p className="capability-card__tag">{capability.tag}</p>
                    </div>
                    <h3>{capability.title}</h3>
                    <p className="capability-row__lead">{capability.copy}</p>
                    <ul className="capability-row__points">
                      {capability.points.map((point) => (
                        <li key={point}><i aria-hidden="true">✓</i>{point}</li>
                      ))}
                    </ul>
                  </div>
                  <figure className="capability-row__art" aria-label={`${capability.title} product preview`}>
                    <CapabilityArt variant={capability.art} />
                  </figure>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="workflow-section" aria-labelledby="workflow-title">
          <div className="landing-shell">
            <p className="landing-kicker landing-kicker--light">From list to arrival</p>
            <div className="workflow-heading">
              <h2 id="workflow-title">Five steps.<br /><em>One source of truth.</em></h2>
              <p>Move from planning to event day without rebuilding the guest list in a different tool at every stage.</p>
            </div>
            <ol className="workflow-steps">
              {workflow.map(([number, title, copy]) => (
                <li key={number}>
                  <span>{number}</span>
                  <div><h3>{title}</h3><p>{copy}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="landing-section landing-section--features">
          <div className="landing-shell">
            <div className="landing-section-heading landing-section-heading--center">
              <p className="landing-kicker">Operational detail when it matters</p>
              <h2>Your team sees what is done—<br /><em>and what needs attention next.</em></h2>
            </div>

            <div className="feature-bento">
              <article className="feature-bento__card feature-bento__card--wide feature-bento__card--lilac">
                <div className="feature-copy">
                  <span className="feature-icon">WA</span>
                  <h3>WhatsApp delivery you can follow</h3>
                  <p>Send approved invitations, passes, and reminders, then see delivery status guest by guest instead of wondering who received what.</p>
                  <div className="feature-pills"><span>Approved templates</span><span>Delivery status</span><span>Scheduled sends</span></div>
                </div>
                <div className="message-stack" aria-hidden="true">
                  <div><small>Event Pro</small><p>Hello Amaka, your invitation to Amina &amp; Tobi is ready.</p><span>Delivered ✓✓</span></div>
                  <div><small>Guest response</small><p>We’ll be there. Chicken for me, vegetarian for Tolu.</p><span>Saved to the guest record</span></div>
                </div>
              </article>

              <article className="feature-bento__card feature-bento__card--dark">
                <div className="feature-copy">
                  <span className="feature-icon">360°</span>
                  <h3>Useful context, not another spreadsheet</h3>
                  <p>Keep households, access levels, protocol notes, preferences, table assignments, and communication status with the right guest.</p>
                </div>
                <div className="vip-card" aria-hidden="true">
                  <span>Guest record</span><strong>Chief A. Okafor</strong><p>Royal table · North entrance · Pass delivered</p>
                </div>
              </article>

              <article className="feature-bento__card feature-bento__card--coral">
                <div className="feature-copy">
                  <span className="feature-icon">✓</span>
                  <h3>A clear answer at the door</h3>
                  <p>Scan a pass to confirm identity, table, access, plus-one status, and whether the guest has already entered.</p>
                </div>
                <div className="scan-success" aria-hidden="true"><i>✓</i><span><b>Welcome, Kemi</b><small>Table 14 · Gold access</small></span></div>
              </article>
            </div>
          </div>
        </section>

        <section id="about" className="about-section">
          <div className="landing-shell about-grid">
            <div className="about-mark" aria-hidden="true"><span>EP</span><i>Built for the room</i></div>
            <div className="about-copy">
              <p className="landing-kicker">Designed around real event teams</p>
              <h2>Great events feel effortless.<br /><em>The operation behind them should feel controlled.</em></h2>
              <p className="about-lead">
                Event Pro is for planners, coordinators, guest managers,
                protocol teams, and check-in crews working together.
              </p>
              <p>
                Use it for weddings, corporate events, conferences, galas,
                faith events, and private celebrations—wherever guest details
                have to survive the journey from invitation to arrival.
              </p>
              <div className="event-types">
                {['Weddings', 'Corporate', 'Conferences', 'Galas', 'Faith events', 'Private events'].map((type) => <span key={type}>{type}</span>)}
              </div>
            </div>
          </div>
        </section>

        <section id="get-started" className="access-section">
          <div className="landing-shell access-card">
            <div>
              <p className="landing-kicker landing-kicker--light">Start with your next event</p>
              <h2>Bring the whole guest journey into one workspace.</h2>
              <p>Create your organization, set up an event, and invite your team. You decide when messages or passes are sent.</p>
              <Link href="/signup" className="landing-button landing-button--light" data-cta="closing-signup">
                Create your workspace <span aria-hidden="true">→</span>
              </Link>
            </div>
            <ul className="access-list">
              <li><i aria-hidden="true">01</i><span><b>Create the event</b><small>Add the date, venue, ticket types, and guest choices.</small></span></li>
              <li><i aria-hidden="true">02</i><span><b>Bring in the guest list</b><small>Import a file or add people individually.</small></span></li>
              <li><i aria-hidden="true">03</i><span><b>Turn on only what you need</b><small>Configure RSVP, WhatsApp, passes, seating, and check-in per event.</small></span></li>
            </ul>
          </div>
        </section>

        <section className="faq-section">
          <div className="landing-shell faq-grid">
            <div>
              <p className="landing-kicker">Good to know</p>
              <h2>Questions, answered.</h2>
            </div>
            <div className="faq-list">
              <details open>
                <summary>Do guests need to download an app?</summary>
                <p>No. Each guest opens a personal link in their browser to respond and uses the pass sent to them for entry.</p>
              </details>
              <details>
                <summary>Can we use our own WhatsApp number?</summary>
                <p>Yes. Event Pro supports a shared sending setup and a dedicated Meta WhatsApp number when your organization needs direct brand control.</p>
              </details>
              <details>
                <summary>Can several people work in the same workspace?</summary>
                <p>Yes. Organization members can work across events with roles that keep sensitive actions limited to the right people.</p>
              </details>
              <details>
                <summary>Does Event Pro work for more than weddings?</summary>
                <p>Yes. The same guest workflow works for conferences, corporate functions, galas, worship events, launches, and private celebrations.</p>
              </details>
            </div>
          </div>
        </section>
      </div>

      <LandingFooter />
    </main>
  )
}
