'use client'

import { FormEvent, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth, useRequireAuth } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

const TIMEZONES = [
  'Africa/Lagos',
  'Africa/Accra',
  'Africa/Johannesburg',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
]

export default function OrganizationPage() {
  useRequireAuth('super_admin')
  const { user, refreshUser } = useAuth()
  const organization = user?.active_organization
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('Africa/Lagos')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!organization) return
    setName(organization.name)
    setTimezone(organization.timezone)
  }, [organization])

  if (!organization) {
    return <div className="p-8 text-sm" style={{ color: 'var(--muted)' }}>Preparing your workspace…</div>
  }

  async function saveWorkspace(event: FormEvent) {
    event.preventDefault()
    setSaving(true); setError(''); setMessage('')
    try {
      await api.updateOrganization(organization!.id, { name: name.trim(), timezone })
      await refreshUser()
      setMessage('Company profile saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the workspace.')
    } finally {
      setSaving(false)
    }
  }

  async function createWorkspace(event: FormEvent) {
    event.preventDefault()
    if (!newName.trim()) return
    setCreating(true); setError(''); setMessage('')
    try {
      await api.createOrganization({ name: newName.trim(), timezone })
      await refreshUser()
      setNewName('')
      setMessage('New workspace created and selected.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the workspace.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="admin-page admin-page--narrow">
      <AdminPageHeader eyebrow="Company" title="Company profile" description="Control the identity, timezone and workspace boundaries for your Event Pro company." />

      {(message || error) && (
        <div
          role={error ? 'alert' : 'status'}
          className="mb-5 rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: error ? 'rgba(239,68,68,0.3)' : 'rgba(22,163,74,0.25)',
            background: error ? 'rgba(239,68,68,0.08)' : 'rgba(22,163,74,0.08)',
            color: error ? 'var(--danger)' : 'var(--success)',
          }}
        >
          {error || message}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <form onSubmit={saveWorkspace} className="admin-surface p-6">
          <div className="flex items-start justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--line)' }}>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>Active company</h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>You are a {organization.role_display.toLowerCase()} in this organization.</p>
            </div>
            <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
              {organization.member_count ?? 1} member{organization.member_count === 1 ? '' : 's'}
            </span>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Company name</span>
              <input required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]" style={{ borderColor: 'var(--line)', background: 'var(--field)', color: 'var(--ink)' }} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Timezone</span>
              <select value={timezone} onChange={(event) => setTimezone(event.target.value)} className="mt-2 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]" style={{ borderColor: 'var(--line)', background: 'var(--field)', color: 'var(--ink)' }}>
                {TIMEZONES.map((zone) => <option key={zone}>{zone}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-5 rounded-xl px-4 py-3" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-2)' }}>Company workspace address</p>
            <p className="mt-1 font-mono text-sm" style={{ color: 'var(--ink)' }}>{organization.slug}</p>
          </div>

          <button disabled={saving || !name.trim()} className="mt-6 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--brand)' }}>
            {saving ? 'Saving…' : 'Save workspace'}
          </button>
        </form>

        <div className="space-y-5">
          <div className="admin-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-2)' }}>Your workspaces</p>
            <div className="mt-4 space-y-2">
              {user?.organizations.map((item) => (
                <div key={item.id} className="rounded-xl px-3.5 py-3" style={{ border: '1px solid var(--line)', background: item.id === organization.id ? 'var(--brand-soft)' : 'var(--bg)' }}>
                  <p className="text-sm font-semibold" style={{ color: item.id === organization.id ? 'var(--brand)' : 'var(--ink)' }}>{item.name}</p>
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>{item.role_display}</p>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={createWorkspace} className="admin-surface p-5">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Add another company</h2>
            <p className="mt-1 text-xs leading-5" style={{ color: 'var(--muted)' }}>Use a separate workspace for an independent company, brand, or planning team.</p>
            <input required value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Company name" className="mt-4 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]" style={{ borderColor: 'var(--line)', background: 'var(--field)', color: 'var(--ink)' }} />
            <button disabled={creating || !newName.trim()} className="mt-3 w-full rounded-full border px-4 py-2.5 text-sm font-semibold transition hover:bg-[var(--brand-soft)] disabled:opacity-50" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}>
              {creating ? 'Creating…' : 'Create workspace'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
