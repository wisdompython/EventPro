'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { OrganizationDomain, OrganizationDomainStatus } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ConfirmDialog, type ConfirmRequest } from '@/components/admin/ConfirmDialog'

const STATUS_TONE: Record<OrganizationDomainStatus, { background: string; color: string }> = {
  active: { background: 'rgba(22,163,74,0.1)', color: 'var(--success)' },
  verified: { background: 'var(--brand-soft)', color: 'var(--brand)' },
  pending: { background: 'var(--chip)', color: 'var(--muted)' },
  failed: { background: 'rgba(239,68,68,0.08)', color: 'var(--danger)' },
}

export default function DomainsPage() {
  useRequireAuth('super_admin')
  const [domains, setDomains] = useState<OrganizationDomain[] | null>(null)
  const [hostname, setHostname] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)

  const load = useCallback(() => {
    api.getDomains()
      .then(setDomains)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your domains.'))
  }, [])

  useEffect(load, [load])

  function replace(updated: OrganizationDomain) {
    // Changing one domain can move "primary" off another, so refetch the set.
    setDomains((current) => current?.map((item) => item.id === updated.id ? updated : item) ?? null)
    load()
  }

  async function addDomain(event: FormEvent) {
    event.preventDefault()
    if (!hostname.trim()) return
    setAdding(true); setError(''); setMessage('')
    try {
      const created = await api.addDomain(hostname.trim())
      setDomains((current) => [...(current ?? []), created])
      setHostname('')
      setMessage(`${created.hostname} added. Create the DNS records below, then check DNS.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that domain.')
    } finally {
      setAdding(false)
    }
  }

  async function run(domain: OrganizationDomain, action: () => Promise<OrganizationDomain | void>, success: (result: OrganizationDomain | void) => string) {
    setBusyId(domain.id); setError(''); setMessage('')
    try {
      const result = await action()
      if (result) replace(result)
      else load()
      setMessage(success(result))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  const verify = (domain: OrganizationDomain) => run(
    domain,
    () => api.verifyDomain(domain.id),
    (result) => result && result.status === 'active'
      ? `${domain.hostname} is active.`
      : (result?.last_check_message || 'DNS checked.'),
  )

  const makePrimary = (domain: OrganizationDomain) => run(
    domain,
    () => api.makePrimaryDomain(domain.id),
    () => `New RSVP links will use ${domain.hostname}.`,
  )

  const askRemove = (domain: OrganizationDomain) => setConfirm({
    title: `Remove ${domain.hostname}?`,
    body: domain.is_primary
      ? 'RSVP links already sent on this domain will stop working, and new links will use your next active domain.'
      : 'RSVP links already sent on this domain will stop working.',
    confirmLabel: 'Remove domain',
    onConfirm: () => {
      setConfirm(null)
      run(domain, () => api.removeDomain(domain.id), () => `${domain.hostname} removed.`)
    },
  })

  return (
    <div className="admin-page admin-page--narrow">
      <AdminPageHeader
        eyebrow="Company"
        title="Domains"
        description="Serve your guest RSVP pages from your own web address. Sign-in and administration stay here."
      />

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

      <form onSubmit={addDomain} className="admin-surface mb-5 p-5 sm:p-6">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Add a domain</h2>
        <p className="mt-1 text-xs leading-5" style={{ color: 'var(--muted)' }}>
          Use a domain you control, such as <span className="font-mono">acme.com</span> or <span className="font-mono">rsvp.acme.com</span>. A subdomain is the quickest to set up.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={hostname}
            onChange={(event) => setHostname(event.target.value)}
            placeholder="rsvp.yourcompany.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border px-3.5 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
            style={{ borderColor: 'var(--line)', background: 'var(--field)', color: 'var(--ink)' }}
          />
          <button disabled={adding || !hostname.trim()} className="rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--brand)' }}>
            {adding ? 'Adding…' : 'Add domain'}
          </button>
        </div>
      </form>

      {domains === null ? (
        <div className="admin-surface p-6 text-sm" style={{ color: 'var(--muted)' }}>Loading domains…</div>
      ) : domains.length === 0 ? (
        <div className="admin-surface p-6 text-sm" style={{ color: 'var(--muted)' }}>
          No domains yet. Until you add one, RSVP links use the Event Pro address.
        </div>
      ) : (
        <div className="space-y-4">
          {domains.map((domain) => (
            <DomainCard
              key={domain.id}
              domain={domain}
              busy={busyId === domain.id}
              onVerify={() => verify(domain)}
              onMakePrimary={() => makePrimary(domain)}
              onRemove={() => askRemove(domain)}
            />
          ))}
        </div>
      )}

      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  )
}

function DomainCard({ domain, busy, onVerify, onMakePrimary, onRemove }: {
  domain: OrganizationDomain
  busy: boolean
  onVerify: () => void
  onMakePrimary: () => void
  onRemove: () => void
}) {
  const tone = STATUS_TONE[domain.status]
  const needsDns = domain.status !== 'active' && domain.dns_records.length > 0
  const isPlatform = domain.type === 'platform_subdomain'

  return (
    <section className="admin-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-all font-mono text-base font-semibold" style={{ color: 'var(--ink)' }}>{domain.hostname}</h2>
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={tone}>{domain.status_display}</span>
            {domain.is_primary && (
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: 'var(--brand)' }}>Primary</span>
            )}
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            {domain.type_display}
            {domain.status === 'active' && <> · RSVP pages at <span className="font-mono">{domain.hostname}/rsvp/…</span></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isPlatform && domain.status !== 'active' && (
            <button type="button" disabled={busy} onClick={onVerify} className="rounded-full px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--brand)' }}>
              {busy ? 'Checking…' : 'Check DNS'}
            </button>
          )}
          {domain.status === 'active' && !domain.is_primary && (
            <button type="button" disabled={busy} onClick={onMakePrimary} className="rounded-full border px-4 py-2 text-xs font-semibold transition hover:bg-[var(--brand-soft)] disabled:opacity-50" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}>
              Use for RSVP links
            </button>
          )}
          {!isPlatform && domain.status === 'active' && (
            <button type="button" disabled={busy} onClick={onVerify} className="rounded-full border px-4 py-2 text-xs font-semibold transition hover:bg-[var(--chip)] disabled:opacity-50" style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}>
              {busy ? 'Checking…' : 'Re-check'}
            </button>
          )}
          {!isPlatform && (
            <button type="button" disabled={busy} onClick={onRemove} className="rounded-full border px-4 py-2 text-xs font-semibold transition hover:bg-[rgba(239,68,68,0.08)] disabled:opacity-50" style={{ borderColor: 'rgba(239,68,68,0.35)', color: 'var(--danger)' }}>
              Remove
            </button>
          )}
        </div>
      </div>

      {domain.last_check_message && (
        <p className="mt-4 rounded-xl px-3.5 py-2.5 text-xs leading-5" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
          {domain.last_check_message}
          {domain.last_checked_at && <> <span style={{ color: 'var(--muted-2)' }}>· checked {new Date(domain.last_checked_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span></>}
        </p>
      )}

      {needsDns && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-2)' }}>Add these records at your DNS provider</p>
          <div className="mt-3 space-y-2">
            {domain.dns_records.map((record) => (
              <div key={`${record.type}-${record.name}-${record.value}`} className="grid gap-2 rounded-xl px-3.5 py-3 text-xs sm:grid-cols-[4rem_1fr_1fr]" style={{ border: '1px solid var(--line)', background: 'var(--bg)' }}>
                <span className="font-semibold" style={{ color: 'var(--ink)' }}>{record.type}</span>
                <CopyValue label="Name" value={record.name} />
                <CopyValue label="Value" value={record.value} />
                <span className="sm:col-span-3" style={{ color: 'var(--muted)' }}>{record.purpose}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5" style={{ color: 'var(--muted)' }}>
            Some providers add your domain to the name automatically. If so, enter only the part before <span className="font-mono">{domain.hostname}</span>. HTTPS is set up for you once the domain is active.
          </p>
        </div>
      )}
    </section>
  )
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        }).catch(() => {})
      }}
      className="min-w-0 text-left"
      title="Copy"
    >
      <span className="block text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-2)' }}>{copied ? 'Copied' : label}</span>
      <span className="block break-all font-mono" style={{ color: 'var(--ink)' }}>{value}</span>
    </button>
  )
}
