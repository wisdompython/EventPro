import Link from 'next/link'

export function AuthStory({ mode = 'login' }: { mode?: 'login' | 'signup' }) {
  const isSignup = mode === 'signup'
  return (
    <section className="auth-story" aria-label="Event Pro product overview">
      <Link href="/" className="auth-brand" aria-label="Event Pro home">
        <span>EP</span> Event Pro
      </Link>
      <div className="auth-story__copy">
        <p className="auth-kicker"><i /> {isSignup ? 'Your first workspace is minutes away' : 'Your event command centre'}</p>
        <h2>
          {isSignup ? 'Set the standard for every event.' : 'The details stay organized.'}<br />
          <em>{isSignup ? 'Start with one calm workspace.' : 'You stay in the moment.'}</em>
        </h2>
        <p>
          {isSignup
            ? 'Create your organization, bring in your team, and turn guest details into a beautifully coordinated experience.'
            : 'Guests, preferences, seating, messages, and check-in—ready whenever your team needs them.'}
        </p>
      </div>
      <div className="auth-event-card" aria-hidden="true">
        <div className="auth-event-card__head">
          <span><i>AT</i><b>Amina &amp; Tobi</b></span>
          <small>On track</small>
        </div>
        <div className="auth-event-card__stats">
          <div><strong>362</strong><span>Confirmed</span></div>
          <div><strong>31/36</strong><span>Tables ready</span></div>
          <div><strong>94%</strong><span>Meals chosen</span></div>
        </div>
        <div className="auth-event-card__progress"><i /></div>
        <p><span>✓</span> Check-in ready on 4 devices</p>
      </div>
      <p className="auth-story__footer">Plan with clarity. Host with confidence.</p>
    </section>
  )
}
