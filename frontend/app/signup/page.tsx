'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AuthStory } from '@/components/auth/AuthStory'
import { useAuth } from '@/lib/auth'
import '../auth.css'

export default function SignupPage() {
  const { signup, user, loading } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    organization_name: '',
    email: '',
    password: '',
    confirm_password: '',
    timezone: 'Africa/Lagos',
    accept_terms: false,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timezone) setForm((current) => ({ ...current, timezone }))
  }, [])

  useEffect(() => {
    if (!loading && user) router.replace('/admin/today')
  }, [loading, router, user])

  function update(field: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (form.password !== form.confirm_password) {
      setError('Your passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await signup(form)
      router.replace('/admin/today')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'We could not create your workspace. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page auth-page--signup">
      <AuthStory mode="signup" />
      <section className="auth-form-panel auth-form-panel--signup">
        <div className="auth-form-wrap auth-form-wrap--signup">
          <div className="auth-mobile-brand"><Link href="/"><span>EP</span> Event Pro</Link></div>
          <div className="auth-form-heading">
            <p className="auth-kicker">Create your workspace</p>
            <h1>Start planning with Event Pro</h1>
            <p>Your account and first organization are created together.</p>
          </div>

          {error && <div className="auth-alert auth-alert--error" role="alert">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-form-grid">
              <label>
                <span>First name</span>
                <input value={form.first_name} onChange={(event) => update('first_name', event.target.value)} required autoComplete="given-name" autoFocus placeholder="Amaka" />
              </label>
              <label>
                <span>Last name</span>
                <input value={form.last_name} onChange={(event) => update('last_name', event.target.value)} required autoComplete="family-name" placeholder="Okafor" />
              </label>
            </div>

            <label>
              <span>Organization or business name</span>
              <input value={form.organization_name} onChange={(event) => update('organization_name', event.target.value)} required autoComplete="organization" placeholder="Amaka Events Studio" />
            </label>

            <label>
              <span>Work email</span>
              <input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} required autoComplete="email" placeholder="amaka@company.com" />
            </label>

            <div className="auth-form-grid">
              <label>
                <span>Password</span>
                <div className="auth-password-field">
                  <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => update('password', event.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
                  <button type="button" onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? 'Hide' : 'Show'}</button>
                </div>
              </label>
              <label>
                <span>Confirm password</span>
                <input type={showPassword ? 'text' : 'password'} value={form.confirm_password} onChange={(event) => update('confirm_password', event.target.value)} required minLength={8} autoComplete="new-password" placeholder="Repeat password" />
              </label>
            </div>

            <p className="auth-password-hint">Use 8 or more characters and avoid a common or entirely numeric password.</p>

            <label className="auth-checkbox">
              <input type="checkbox" checked={form.accept_terms} onChange={(event) => update('accept_terms', event.target.checked)} required />
              <span>I agree to the Event Pro product terms and privacy notice.</span>
            </label>

            <button type="submit" disabled={submitting || loading} className="auth-submit">
              <span>{submitting ? 'Creating your workspace…' : 'Create workspace'}</span><i aria-hidden="true">→</i>
            </button>
          </form>

          <p className="auth-signin-link">Already have an account? <Link href="/login">Sign in</Link></p>
        </div>
      </section>
    </main>
  )
}
