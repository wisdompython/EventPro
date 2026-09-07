import { authApi } from './auth';
import { guestsApi } from './guests';
import { eventsApi, fontsApi } from './events';
import { remindersApi } from './reminders';
import { rsvpApi } from './rsvp';
import { operationsApi } from './operations';
import { requirementsApi } from './requirements';
import { seatingApi } from './seating';
import { preferencesApi } from './preferences';

export const api = {
  ...authApi,
  ...guestsApi,
  ...eventsApi,
  ...fontsApi,
  ...remindersApi,
  ...rsvpApi,
  ...operationsApi,
  ...requirementsApi,
  ...seatingApi,
  ...preferencesApi,
};

export type {
  EventReminder, WhatsAppTemplate, TemplateCategory, Guest, CheckInGuest, GuestList, GuestListStats,
  Event, CreateGuestPayload, RsvpWorkflow, RsvpWorkflowStatus, RsvpStats, RsvpRecipient,
  RsvpRecipientSegment, RsvpResponseStatus, RsvpInvitationStatus, RsvpPassStatus,
  PaginatedRsvpRecipients, PublicRsvpDetails,
  QueueMonitorSnapshot,
  SeatingTable, SeatingSection, SeatingTableGuests, CreateSeatingSectionPayload, SeatingFeature,
  SeatingPathPoint,
  PreferenceDashboard, PreferenceGuest, PreferenceAnswer, PreferenceQuestionTotal,
  PreferenceSeatingGuest, PreferenceSeatingTable,
} from './types';
