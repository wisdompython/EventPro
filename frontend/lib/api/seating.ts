import { request } from './request';
import type {
  CreateSeatingSectionPayload,
  SeatingSection,
  SeatingTable,
  SeatingTableGuests,
} from './types';

export const seatingApi = {
  /** The whole plan: every section with its tables. */
  getSeatingSections: async (eventId: number): Promise<SeatingSection[]> => {
    const res = await request<SeatingSection[] | { results: SeatingSection[] }>(
      `/seating-sections/?event=${eventId}`,
    )
    return Array.isArray(res) ? res : res.results
  },

  /** Create a section and, optionally, its tables in one step. */
  createSeatingSection: (data: CreateSeatingSectionPayload) =>
    request<SeatingSection>('/seating-sections/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSeatingSection: (id: number, data: Partial<SeatingSection>) =>
    request<SeatingSection>(`/seating-sections/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteSeatingSection: (id: number) =>
    request<void>(`/seating-sections/${id}/`, { method: 'DELETE' }),

  /** Append more tables to a section, continuing its numbering. */
  addSeatingTables: (
    sectionId: number,
    count: number,
    seats = 8,
    shape: 'round' | 'rectangle' = 'round',
  ) =>
    request<SeatingSection>(`/seating-sections/${sectionId}/add_tables/`, {
      method: 'POST',
      body: JSON.stringify({ count, seats, shape }),
    }),

  /** Re-flow a section's tables into a tidy grid. */
  relayoutSeatingSection: (sectionId: number) =>
    request<SeatingSection>(`/seating-sections/${sectionId}/relayout/`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  /** Persist a drag — sections and tables together, in one round trip. */
  saveSeatingPositions: (
    event: number,
    sections: Array<{ id: number; x: number; y: number; width?: number; height?: number }>,
    tables: Array<{ id: number; x: number; y: number }> = [],
  ) =>
    request<{ updated: number }>('/seating-sections/positions/', {
      method: 'POST',
      body: JSON.stringify({ event, sections, tables }),
    }),

  updateSeatingTable: (id: number, data: Partial<SeatingTable>) =>
    request<SeatingTable>(`/seating-tables/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteSeatingTable: (id: number) =>
    request<void>(`/seating-tables/${id}/`, { method: 'DELETE' }),

  getSeatingTableGuests: (id: number) =>
    request<SeatingTableGuests>(`/seating-tables/${id}/guests/`),

  assignSeatingGuests: (id: number, add: string[], remove: string[] = []) =>
    request<{ seated: number; cleared: number }>(`/seating-tables/${id}/assign/`, {
      method: 'POST',
      body: JSON.stringify({ add, remove }),
    }),
};
