import { request } from './request'
import type { OrganizationDomain } from './types'

export const domainsApi = {
  getDomains: () => request<OrganizationDomain[]>('/auth/domains/'),

  addDomain: (hostname: string) =>
    request<OrganizationDomain>('/auth/domains/', {
      method: 'POST',
      body: JSON.stringify({ hostname }),
    }),

  /** Re-check DNS now. Moves the domain towards active, or explains why not. */
  verifyDomain: (id: number) =>
    request<OrganizationDomain>(`/auth/domains/${id}/verify/`, { method: 'POST' }),

  makePrimaryDomain: (id: number) =>
    request<OrganizationDomain>(`/auth/domains/${id}/make-primary/`, { method: 'POST' }),

  removeDomain: (id: number) =>
    request<void>(`/auth/domains/${id}/`, { method: 'DELETE' }),
}
