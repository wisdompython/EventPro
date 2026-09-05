import { request } from './request';
import type { GuestRequirement, GuestRequirementPreset } from './types';

export const requirementsApi = {
  getRequirements: async (eventId: number): Promise<GuestRequirement[]> => {
    const res = await request<GuestRequirement[] | { results: GuestRequirement[] }>(
      `/requirements/?event=${eventId}`,
    )
    return Array.isArray(res) ? res : res.results
  },

  getRequirementPresets: () =>
    request<GuestRequirementPreset[]>('/requirements/presets/'),

  createRequirement: (data: Partial<GuestRequirement> & { event: number }) =>
    request<GuestRequirement>('/requirements/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRequirement: (id: number, data: Partial<GuestRequirement>) =>
    request<GuestRequirement>(`/requirements/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteRequirement: (id: number) =>
    request<void>(`/requirements/${id}/`, { method: 'DELETE' }),

  reorderRequirements: (event: number, order: number[]) =>
    request<{ updated: number }>('/requirements/reorder/', {
      method: 'POST',
      body: JSON.stringify({ event, order }),
    }),
};
