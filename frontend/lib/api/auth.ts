import { request } from './request';
import type { AuthUser, CreateUserPayload, Organization, SignupPayload } from './types';

export const authApi = {
  login: (username: string, password: string) =>
    request<AuthUser>('/auth/login/', { method: 'POST', body: JSON.stringify({ username, password }) }),
  signup: (data: SignupPayload) =>
    request<AuthUser>('/auth/signup/', { method: 'POST', body: JSON.stringify(data) }),
  logout: () =>
    request<void>('/auth/logout/', { method: 'POST' }),
  me: () =>
    request<AuthUser>('/auth/me/'),
  getOrganizations: () =>
    request<Organization[] | { results: Organization[] }>('/auth/organizations/').then((data) => Array.isArray(data) ? data : data.results),
  createOrganization: (data: { name: string; timezone: string }) =>
    request<Organization>('/auth/organizations/', { method: 'POST', body: JSON.stringify(data) }),
  updateOrganization: (id: number, data: Partial<Pick<Organization, 'name' | 'timezone'>>) =>
    request<Organization>(`/auth/organizations/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  activateOrganization: (id: number) =>
    request<{ active_organization: Organization }>(`/auth/organizations/${id}/activate/`, { method: 'POST' }),
  getUsers: async (): Promise<AuthUser[]> => {
    const res = await request<AuthUser[] | { results: AuthUser[] }>('/auth/users/')
    return Array.isArray(res) ? res : res.results
  },
  createUser: (data: CreateUserPayload) =>
    request<AuthUser>('/auth/users/', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: number, data: Partial<Pick<AuthUser, 'email' | 'first_name' | 'last_name' | 'role' | 'is_active'>> & { password?: string }) =>
    request<AuthUser>(`/auth/users/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id: number) =>
    request<void>(`/auth/users/${id}/`, { method: 'DELETE' }),
};
