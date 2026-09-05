'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { AuthStory } from '@/components/auth/AuthStory'
import '../auth.css'

function LoginForm() {
  const { login, user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedNext = searchParams.get('next')
  const next = requestedNext?.startsWith('/') && !requestedNext.startsWith('//')
    ? requestedNext
    : '/admin/today'
  const sessionExpired = searchParams.get('session') === 'expired'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!loading && user) router.replace(next)
  }, [user, loading, router, next])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username, password)
      router.replace(next)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'We could not sign you in. Check your details and try again.')
      setSubmitting(false)
    }
  }

  if (loading) return <div className="auth-form-loading" aria-label="Loading" />

  return (
    <section className="auth-form-panel">
      <div className="auth-form-wrap">
        <div className="auth-mobile-brand"><Link href="/"><span>EP</span> Event Pro</Link></div>
        <div className="auth-form-heading">
          <p className="auth-kicker">Welcome back</p>
          <h1>Sign in to Event Pro</h1>
          <p>Enter your email or username to continue to your workspace.</p>
        </div>

        {sessionExpired && !error && <div className="auth-alert auth-alert--warning">Your session expired. Sign in again to continue.</div>}
        {error && <div className="auth-alert auth-alert--error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            <span>Email or username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
              autoFocus
              placeholder="you@company.com"
            />
          </label>

          <label>
            <span className="auth-field-heading">
              <span>Password</span>
              <Link href="/forgot-password">Forgot password?</Link>
            </span>
            <div className="auth-password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
              />
              <button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <button type="submit" disabled={submitting} className="auth-submit">
            <span>{submitting ? 'Signing in…' : 'Sign in'}</span><i aria-hidden="true">→</i>
          </button>
        </form>

        <div className="auth-divider"><span>New to Event Pro?</span></div>
        <Link href="/signup" className="auth-secondary">Create your workspace</Link>
        <p className="auth-help">Need access to an existing workspace? Ask its owner to add you to the team.</p>
      </div>
    </section>
  )
}

export default function LoginPage() {
  return (
    <main className="auth-page">
      <AuthStory />
      <Suspense fallback={<section className="auth-form-panel"><div className="auth-form-loading" /></section>}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
