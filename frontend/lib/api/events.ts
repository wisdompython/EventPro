import { request } from './request';
import type { Event, EventRsvpCustomization, Font } from './types';

export const eventsApi = {
  getEvents: () =>
    request<{ results: Event[] } | Event[]>('/events/').then((data) =>
      Array.isArray(data) ? data : data.results ?? []
    ),
  getEvent: (id: number) => request<Event>(`/events/${id}/`),
  createEvent: (data: Partial<Event>) =>
    request<Event>('/events/', { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (id: number, data: Partial<Event>) =>
    request<Event>(`/events/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  getEventRsvpCustomization: (id: number) =>
    request<EventRsvpCustomization>(`/events/${id}/rsvp-page/`),
  updateEventRsvpCustomization: (id: number, data: FormData) =>
    request<EventRsvpCustomization>(`/events/${id}/rsvp-page/`, { method: 'PATCH', body: data }),
  deleteEvent: (id: number) =>
    request<void>(`/events/${id}/`, { method: 'DELETE' }),
};

export const fontsApi = {
  getFonts: () =>
    request<{ results: Font[] } | Font[]>('/fonts/').then((data) =>
      Array.isArray(data) ? data : data.results ?? []
    ),
  deleteFont: (id: number) =>
    request<void>(`/fonts/${id}/`, { method: 'DELETE' }),
};
