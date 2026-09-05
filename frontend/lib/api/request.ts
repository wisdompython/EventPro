export const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

export function getCsrfToken(): string {
  if (typeof document === 'undefined') return ''
  return document.cookie.split('; ').find((c) => c.startsWith('csrftoken='))?.split('=')[1] ?? ''
}

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS', 'TRACE']

/**
 * Ask the API to set a csrftoken cookie. Safe to call repeatedly.
 * Needed before the first mutating request of a session, because Django only
 * sets the cookie on a view that has been through CsrfViewMiddleware.
 */
export async function ensureCsrfToken(): Promise<string> {
  const existing = getCsrfToken()
  if (existing) return existing
  await fetch(`${BASE_URL}/auth/csrf/`, { credentials: 'include' }).catch(() => {})
  return getCsrfToken()
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData
  const method = (options?.method ?? 'GET').toUpperCase()
  const needsCsrf = !SAFE_METHODS.includes(method)
  const csrfToken = needsCsrf ? await ensureCsrfToken() : ''
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(needsCsrf && csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
    ...(options?.headers as Record<string, string> ?? {}),
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (res.status === 401) {
    // Session expired — redirect to login from any page
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login?session=expired'
    }
    throw new Error('Session expired. Please log in again.')
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    const firstFieldError = Object.values(error).find((value) => Array.isArray(value) && value.length)
    throw new Error(error.detail ?? (Array.isArray(firstFieldError) ? String(firstFieldError[0]) : `Request failed: ${res.status}`));
  }
  if (res.status === 204) return undefined as T
  return res.json();
}
