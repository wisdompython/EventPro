'use client'

import Link from 'next/link'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { AuthStory } from '@/components/auth/AuthStory'
import '../auth.css'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const uid = searchParams.get('uid') ?? ''
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const hasLink = Boolean(uid && token)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const response = await api.confirmPasswordReset({ uid, token, new_password: password, confirm_password: confirm })
      setMessage(response.detail)
      setPassword('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-form-panel">
      <div className="auth-form-wrap">
        <div className="auth-mobile-brand"><Link href="/"><span>EP</span> Event Pro</Link></div>
        <div className="auth-form-heading">
          <p className="auth-kicker">Secure reset</p>
          <h1>Choose a new password</h1>
          <p>Use at least eight characters and avoid common or entirely numeric passwords.</p>
        </div>

        {!hasLink && <div className="auth-alert auth-alert--error">This password reset link is incomplete.</div>}
        {message && <div className="auth-alert auth-alert--success" role="status">{message}</div>}
        {error && <div className="auth-alert auth-alert--error" role="alert">{error}</div>}

        {hasLink && !message && (
          <form onSubmit={handleSubmit} className="auth-form">
            <label>
              <span>New password</span>
              <div className="auth-password-field">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" autoFocus placeholder="Enter a strong password" />
                <button type="button" onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
            </label>
            <label>
              <span>Confirm new password</span>
              <input type={showPassword ? 'text' : 'password'} value={confirm} onChange={(event) => setConfirm(event.target.value)} required minLength={8} autoComplete="new-password" placeholder="Repeat your new password" />
            </label>
            <button type="submit" disabled={submitting} className="auth-submit">
              <span>{submitting ? 'Updating password…' : 'Update password'}</span><i aria-hidden="true">→</i>
            </button>
          </form>
        )}

        <p className="auth-signin-link"><Link href="/login">{message ? 'Sign in with your new password →' : '← Back to sign in'}</Link></p>
      </div>
    </section>
  )
}

export default function ResetPasswordPage() {
  return (
    <main className="auth-page">
      <AuthStory mode="login" />
      <Suspense fallback={<section className="auth-form-panel"><div className="auth-form-loading" /></section>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  )
}
