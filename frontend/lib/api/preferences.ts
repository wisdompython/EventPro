import { request } from './request';
import type { PreferenceDashboard } from './types';

export const preferencesApi = {
  /** Totals and the per-guest roster for one event, in a single request. */
  getPreferenceDashboard: (
    eventId: number,
    options: { search?: string; answered?: 'yes' | 'no' | '' } = {},
  ) => {
    const params = new URLSearchParams({ event: String(eventId) })
    if (options.search) params.set('search', options.search)
    if (options.answered) params.set('answered', options.answered)
    return request<PreferenceDashboard>(`/preferences/dashboard/?${params}`)
  },
};
