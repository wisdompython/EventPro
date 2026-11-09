import { authApi } from './auth';
import { guestsApi } from './guests';
import { eventsApi, fontsApi } from './events';
import { remindersApi } from './reminders';
import { rsvpApi } from './rsvp';
import { operationsApi } from './operations';
import { requirementsApi } from './requirements';
import { seatingApi } from './seating';
import { preferencesApi } from './preferences';
import { messagingSettingsApi } from './messagingSettings';
import { domainsApi } from './domains';
import { publicSiteApi } from './publicSite';

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
  ...messagingSettingsApi,
  ...domainsApi,
  ...publicSiteApi,
};

export type {
  EventReminder, WhatsAppTemplate, TemplateCategory, Guest, CheckInGuest, GuestList, GuestListStats,
  Event, EventLocation, EventRsvpCustomization, CreateGuestPayload, RsvpWorkflow, RsvpWorkflowStatus, RsvpStats, RsvpRecipient,
  RsvpRecipientSegment, RsvpResponseStatus, RsvpInvitationStatus, RsvpPassStatus,
  RsvpRecipientOrdering,
  PaginatedRsvpRecipients, PublicRsvpDetails,
  QueueMonitorSnapshot,
  SeatingTable, SeatingSection, SeatingTableGuests, CreateSeatingSectionPayload, SeatingFeature,
  SeatingPathPoint,
  PreferenceDashboard, PreferenceGuest, PreferenceAnswer, PreferenceQuestionTotal,
  PreferenceSeatingGuest, PreferenceSeatingTable,
  MessagingSettingsPayload, MessagingSettingsField, MessagingSettingsFieldName,
  MessagingSettingsUpdate, MessagingSettingsAuditEntry, MessagingSettingsValue,
  OrganizationDomain, OrganizationDomainDnsRecord, OrganizationDomainStatus, OrganizationDomainType,
} from './types';
