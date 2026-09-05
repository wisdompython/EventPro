'use client'

import Link from 'next/link'
import { useState } from 'react'
import { api } from '@/lib/api'
import { AuthStory } from '@/components/auth/AuthStory'
import '../auth.css'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSubmitting(true)
    try {
      const response = await api.requestPasswordReset(email)
      setMessage(response.detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request a password reset.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <AuthStory mode="login" />
      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand"><Link href="/"><span>EP</span> Event Pro</Link></div>
          <div className="auth-form-heading">
            <p className="auth-kicker">Account recovery</p>
            <h1>Reset your password</h1>
            <p>Enter your account email. We will send a secure, one-time reset link.</p>
          </div>

          {message && <div className="auth-alert auth-alert--success" role="status">{message}</div>}
          {error && <div className="auth-alert auth-alert--error" role="alert">{error}</div>}

          {!message && (
            <form onSubmit={handleSubmit} className="auth-form">
              <label>
                <span>Work email</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" autoFocus placeholder="you@company.com" />
              </label>
              <button type="submit" disabled={submitting} className="auth-submit">
                <span>{submitting ? 'Sending reset link…' : 'Send reset link'}</span><i aria-hidden="true">→</i>
              </button>
            </form>
          )}

          <p className="auth-signin-link"><Link href="/login">← Back to sign in</Link></p>
        </div>
      </section>
    </main>
  )
}
