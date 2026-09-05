'use client'

import { useState, useEffect } from 'react'
import { api, AuthUser, UserRole, CreateUserPayload } from '@/lib/api'
import { useAuth, useRequireAuth } from '@/lib/auth'
import { UserTable } from '@/components/users/UserTable'
import { UserFormModal } from '@/components/users/UserFormModal'
import { ROLES, ROLE_STYLE, ROLE_DESC } from '@/components/users/roleConstants'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'

const EMPTY_FORM: CreateUserPayload = {
  username: '', email: '', first_name: '', last_name: '', role: 'viewer', password: '',
}

export default function UsersPage() {
  useRequireAuth('super_admin')
  const { user: me } = useAuth()

  const [users, setUsers]           = useState<AuthUser[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState<CreateUserPayload>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError]   = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    api.getUsers().then(setUsers).catch(console.error).finally(() => setLoading(false))
  }, [])

  function setField<K extends keyof CreateUserPayload>(key: K, val: CreateUserPayload[K]) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  async function handleCreate(e: React.SyntheticEvent) {
    e.preventDefault(); setFormError(''); setSubmitting(true)
    try {
      const u = await api.createUser(form)
      setUsers((prev) => [...prev, u])
      setForm(EMPTY_FORM); setShowForm(false)
    } catch (err: unknown) { setFormError(err instanceof Error ? err.message : 'Failed to create user.') }
    finally { setSubmitting(false) }
  }

  async function handleEditSave(userId: number, data: Partial<AuthUser> & { password?: string }) {
    const u = await api.updateUser(userId, data)
    setUsers((prev) => prev.map((x) => x.id === userId ? u : x))
  }

  async function handleDelete(user: AuthUser) {
    if (!confirm(`Permanently delete ${user.username}?`)) return
    setDeletingId(user.id)
    try { await api.deleteUser(user.id); setUsers((prev) => prev.filter((x) => x.id !== user.id)) }
    catch { /* ignore */ } finally { setDeletingId(null) }
  }

  return (
    <div className="admin-page">
      <AdminPageHeader eyebrow="Company access" title="Crew access" description="Invite crew members and give each person the minimum access they need to run events safely." actions={<button onClick={() => { setShowForm((s) => !s); setFormError('') }} data-tour="team-new-user-button" className={showForm ? 'admin-secondary-action' : 'admin-primary-action'}>{showForm ? 'Close form' : '＋ Invite crew member'}</button>} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map(({ value, label }) => (
          <div key={value} className="admin-surface px-4 py-4">
            <span className="inline-block mb-1.5 rounded-sm px-2 py-0.5 text-xs font-semibold"
              style={{ background: ROLE_STYLE[value].bg, color: ROLE_STYLE[value].color }}>
              {label}
            </span>
            <p className="text-xs leading-5" style={{ color: 'var(--muted)' }}>{ROLE_DESC[value]}</p>
          </div>
        ))}
      </div>

      <div className="admin-surface">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{users.length} users</p>
          <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-semibold text-[var(--brand)]">{users.filter((user) => user.is_active).length} active</span>
        </div>
        {showForm && (
          <UserFormModal form={form} submitting={submitting} formError={formError}
            onSubmit={handleCreate} onFieldChange={setField} />
        )}
        <UserTable
          users={users} loading={loading} meId={me?.id}
          editingId={null} editingRole={'viewer'} savingId={null} deletingId={deletingId}
          onEditStart={() => {}} onEditCancel={() => {}} onEditingRoleChange={() => {}}
          onRoleSave={() => {}} onToggleActive={() => {}} onDelete={handleDelete}
          onEditSave={handleEditSave}
        />
      </div>
    </div>
  )
}
