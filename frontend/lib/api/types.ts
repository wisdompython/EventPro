export type UserRole = 'super_admin' | 'event_manager' | 'check_in_staff' | 'scanner' | 'viewer';
export type MembershipRole = 'owner' | 'admin' | 'manager' | 'check_in' | 'scanner' | 'viewer';

export interface Organization {
  id: number;
  name: string;
  slug: string;
  timezone: string;
  is_active: boolean;
  role: MembershipRole;
  role_display: string;
  member_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  role_display: string;
  membership_role: MembershipRole | null;
  membership_role_display: string | null;
  active_organization: Organization | null;
  organizations: Organization[];
  is_platform_admin: boolean;
  is_active: boolean;
  date_joined: string;
  last_login: string | null;
}

export interface CreateUserPayload {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  password: string;
}

export interface SignupPayload {
  first_name: string;
  last_name: string;
  organization_name: string;
  email: string;
  password: string;
  confirm_password: string;
  timezone: string;
  accept_terms: boolean;
}

export interface QueueMonitorSnapshot {
  generated_at: string;
  broker: {
    available: boolean;
    error: string;
    queues: Array<{ name: string; pending: number | null }>;
  };
  workers: {
    available: boolean;
    error: string;
    workers: Array<{
      name: string;
      online: boolean;
      queues: string[];
      concurrency: number | null;
      active: number;
      reserved: number;
      scheduled: number;
    }>;
    tasks: Array<{
      id: string;
      name: string;
      worker: string;
      state: 'active' | 'reserved' | 'scheduled';
      queue: string;
      time_start: number | null;
      eta: string | null;
    }>;
  };
  periodic_dispatchers: Array<{
    name: string;
    task: string;
    enabled: boolean;
    last_run_at: string | null;
    seconds_since_last_run: number | null;
    overdue_seconds: number | null;
    total_runs: number;
    healthy: boolean;
  }>;
  recent_tasks: Array<{
    id: string;
    name: string;
    status: string;
    worker: string;
    created_at: string;
    started_at: string | null;
    finished_at: string;
    runtime_ms: number | null;
    error: string;
  }>;
  deliveries: Array<{
    recipient_id: number;
    workflow_id: number;
    event: string;
    guest: string;
    phone: string;
    channel: 'invitation' | 'pass';
    status: 'queued' | 'sending' | 'failed';
    template: string;
    queued_at: string | null;
    retries: number;
    error: string;
    updated_at: string;
  }>;
  message_rate: {
    configured_per_worker_per_minute: number;
    workers_consuming_messages: number;
    estimated_global_ceiling_per_minute: number;
  };
  send_budget: {
    window_hours: number;
    // The budget is per organization — each tenant has its own WhatsApp
    // Business account and messaging tier. The totals are cross-tenant sums,
    // meaningful only on this platform-superuser view.
    organizations: Array<{
      organization_id: number;
      organization: string;
      daily_limit: number;
      remaining: number;
    }>;
    total_daily_limit: number;
    total_remaining: number;
  };
}

export type TicketType = string;
export type GuestStatus = 'registered' | 'checked_in';

export interface Guest {
  id: string;
  event: number | null;
  event_name: string;
  full_name: string;
  phone_number: string;
  email: string;
  ticket_type: TicketType;
  table_number: string;
  seat_number: string;
  aso_ebi_requested: boolean;
  aso_ebi_quantity: number;
  plus_one_attending: boolean;
  has_named_plus_one: boolean;
  plus_one_guest_id: string | null;
  named_plus_one_name: string;
  is_plus_one: boolean;
  primary_guest_name: string;
  celebrant_name: string;
  preferences_link: string;
  preferences_submitted_at: string | null;
  plus_one_checked_in: boolean;
  plus_one_checked_in_at: string | null;
  qr_code: string | null;
  pass_image: string | null;
  status: GuestStatus;
  checked_in_at: string | null;
  whatsapp_sent: boolean;
  whatsapp_sent_at: string | null;
  scheduled_send_at: string | null;
  registered_at: string;
  rsvp_response_status?: RsvpResponseStatus | null;
  rsvp_invitation_status?: RsvpInvitationStatus | null;
  rsvp_pass_status?: RsvpPassStatus | null;
}

/** Privacy-safe operational data returned to scanner and door-desk users. */
export type CheckInGuest = Pick<Guest,
  | 'id' | 'event' | 'event_name' | 'full_name' | 'ticket_type'
  | 'table_number' | 'seat_number' | 'celebrant_name'
  | 'status' | 'checked_in_at' | 'registered_at'
  | 'plus_one_attending' | 'plus_one_checked_in'
  | 'has_named_plus_one' | 'named_plus_one_name'
> & {
  seating_area: string;
  service_preferences: Array<{
    key: string;
    label: string;
    kind: RequirementKind;
    value: string;
  }>;
};

export interface GuestListStats {
  checked_in: number;
  pending: number;
  wa_sent: number;
  wa_unsent: number;
  has_rsvp: boolean;
  confirmed: number;
  declined: number;
  awaiting: number;
  delivery_failed: number;
}

export interface GuestList {
  count: number;
  next: string | null;
  previous: string | null;
  results: Guest[];
  stats: GuestListStats;
}

export type CreateGuestPayload = Pick<
  Guest,
  'full_name' | 'phone_number' | 'email' | 'ticket_type' | 'table_number' | 'seat_number' | 'aso_ebi_requested' | 'aso_ebi_quantity' | 'plus_one_attending' | 'celebrant_name' | 'event'
> & {
  seating_area?: string;
  scheduled_send_at?: string | null;
  plus_one_full_name?: string;
  plus_one_phone_number?: string;
};

export interface TicketTypeDef {
  value: string;
  label: string;
}

/** One named stop in a multi-location event's schedule. */
export interface EventLocation {
  id: number
  name: string
  venue: string
  starts_at: string | null
  sort_order: number
}

export interface Event {
  id: number;
  name: string;
  date: string;
  venue: string;
  locations?: EventLocation[];
  description: string;
  rsvp_message: string;
  color_of_day: string;
  rsvp_primary_color: string;
  rsvp_background_color: string;
  rsvp_card_color: string;
  rsvp_text_color: string;
  rsvp_background_image: string | null;
  rsvp_hero_image: string | null;
  rsvp_logo: string | null;
  design_template: string | null;
  qr_zone_x: number | null;
  qr_zone_y: number | null;
  qr_zone_w: number | null;
  qr_zone_h: number | null;
  name_zone_x: number | null;
  name_zone_y: number | null;
  name_zone_w: number | null;
  name_zone_h: number | null;
  name_font: number | null;
  name_font_name: string | null;
  name_font_color: string;
  name_font_size_fraction: number;
  qr_bg_color: string;
  ticket_types: TicketTypeDef[];
  required_fields: string[];
  collect_aso_ebi: boolean;
  allow_plus_one: boolean;
  /** Organiser-chosen wording. Blank means "use the default". */
  plus_one_label: string;
  aso_ebi_label: string;
  aso_ebi_unit: string;
  /** Resolved wording (label if set, otherwise the default). Read-only. */
  plus_one_term: string;
  aso_ebi_term: string;
  aso_ebi_unit_term: string;
  preferences_enabled: boolean;
  preferences_deadline: string | null;
  collect_celebrant: boolean;
  celebrant_options: string[];
  whatsapp_enabled: boolean;
  rsvp_enabled: boolean;
  whatsapp_template: number | null;
  whatsapp_template_name: string | null;
  pass_send_at: string | null;
  rsvp_workflow_id: number | null;
  is_ended: boolean;
  seating_plan_width: number;
  seating_plan_height: number;
  guest_count: number;
  checked_in_count: number;
  confirmed_count: number;
  plus_one_count: number;
  plus_one_checked_in_count: number;
  total_checked_in_count: number;
  estimated_guest_count: number;
  aso_ebi_request_count: number;
  aso_ebi_quantity: number;
  preferences_submitted_count: number;
  celebrant_breakdown: Array<{
    name: string;
    guests: number;
    plus_ones: number;
    estimated_guests: number;
  }>;
  created_at: string;
}

/** The restricted, publishable RSVP appearance edited by organization owners/admins. */
export interface EventRsvpCustomization {
  id: number;
  name: string;
  rsvp_message: string;
  color_of_day: string;
  rsvp_primary_color: string;
  rsvp_background_color: string;
  rsvp_card_color: string;
  rsvp_text_color: string;
  rsvp_background_image: string | null;
  rsvp_hero_image: string | null;
  rsvp_logo: string | null;
}

export interface Font {
  id: number;
  name: string;
  file: string;
  uploaded_at: string;
}

export interface EventReminder {
  id: number;
  event: number;
  hours_before: number;
  template_name: string;
  is_active: boolean;
  created_at: string;
  logs_sent: number;
  includes_event_pass: boolean;
}

export interface TemplateCategory {
  id: number;
  name: string;
  created_at: string;
}

export interface WhatsAppTemplate {
  id: number;
  name: string;
  display_name: string;
  description: string;
  category: number | null;
  category_name: string | null;
  body_text: string;
  body_params: string[];
  has_header_image: boolean;
  is_active: boolean;
  created_at: string;
  /**
   * Event whose schedule the location placeholders were numbered against.
   * Display only — it never restricts which events the template may be sent for.
   */
  built_for_event?: number | null;
  built_for_event_name?: string | null;
  built_for_locations?: string[];
}

export type RsvpWorkflowStatus = 'draft' | 'active' | 'paused' | 'completed';
export type RsvpResponseStatus = 'awaiting' | 'confirmed' | 'declined';
export type RsvpInvitationStatus = 'not_sent' | 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type RsvpPassStatus = 'held' | 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'not_issued';
export type RsvpRecipientOrdering = 'name' | '-name' | 'sent' | '-sent' | 'confirmed' | '-confirmed' | 'last_message' | '-last_message';

export interface RsvpStats {
  invited: number;
  awaiting: number;
  confirmed: number;
  declined: number;
  invitation_delivered: number;
  invitation_failed: number;
  passes_sent: number;
  passes_failed: number;
  delivery_failed: number;
  confirmed_no_pass: number;
  aso_ebi_requests: number;
  aso_ebi_quantity: number;
  plus_ones: number;
  estimated_guests: number;
  response_rate: number;
  confirmation_rate: number;
}

export interface RsvpWorkflow {
  id: number;
  event: number;
  event_name: string;
  event_date: string;
  invitation_template: number | null;
  invitation_template_name: string | null;
  pass_template: number | null;
  pass_template_name: string | null;
  invitation_design: string | null;
  invitation_name_zone_x: number | null;
  invitation_name_zone_y: number | null;
  invitation_name_zone_w: number | null;
  invitation_name_zone_h: number | null;
  status: RsvpWorkflowStatus;
  response_deadline: string | null;
  invitation_send_at: string | null;
  auto_send_pass: boolean;
  pass_send_at: string | null;
  launched_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  stats: RsvpStats;
}

export interface RsvpRecipient {
  id: number;
  workflow: number;
  guest: string;
  guest_name: string;
  event_name: string;
  ticket_type: string;
  table_number: string;
  aso_ebi_requested: boolean;
  aso_ebi_quantity: number;
  plus_one_attending: boolean;
  is_plus_one: boolean;
  primary_guest_name: string;
  celebrant_name: string;
  has_phone: boolean;
  response_status: RsvpResponseStatus;
  invitation_status: RsvpInvitationStatus;
  invitation_image: string | null;
  pass_status: RsvpPassStatus;
  invitation_sent_at: string | null;
  invitation_queued_at: string | null;
  responded_at: string | null;
  pass_queued_at: string | null;
  pass_sent_at: string | null;
  reminder_count: number;
  last_reminded_at: string | null;
  last_message_sent_at: string | null;
  last_error: string;
  invitation_error: string;
  pass_error: string;
  invitation_auto_retries: number;
  pass_auto_retries: number;
  invitation_last_template_name: string;
  pass_last_template_name: string;
  created_at: string;
  updated_at: string;
}

export type RsvpRecipientSegment =
  | 'invited_awaiting'
  | 'confirmed_with_pass'
  | 'confirmed_no_pass'
  | 'delivery_failed';

export interface PaginatedRsvpRecipients {
  count: number;
  next: string | null;
  previous: string | null;
  results: RsvpRecipient[];
}

export interface PublicRsvpDetails {
  /** Present when the page is served from the organization's own domain. */
  organization_name?: string;
  /** Questions the planner configured for this event. */
  requirements: GuestRequirementField[];
  guest_name: string;
  event_name: string;
  event_date: string;
  venue: string;
  rsvp_message: string;
  color_of_day: string;
  rsvp_primary_color: string;
  rsvp_background_color: string;
  rsvp_card_color: string;
  rsvp_text_color: string;
  rsvp_background_image: string | null;
  rsvp_hero_image: string | null;
  rsvp_logo: string | null;
  collect_aso_ebi: boolean;
  allow_plus_one: boolean;
  /** Resolved organiser wording, already defaulted server-side. */
  plus_one_term: string;
  aso_ebi_term: string;
  aso_ebi_unit_term: string;
  collect_celebrant: boolean;
  celebrant_options: string[];
  aso_ebi_requested: boolean;
  aso_ebi_quantity: number;
  plus_one_attending: boolean;
  plus_one_full_name: string;
  plus_one_phone_number: string;
  celebrant_name: string;
  invitation_image: string | null;
  response_deadline: string | null;
  response_status: RsvpResponseStatus;
  responded_at: string | null;
  can_respond: boolean;
  closed_reason: 'deadline_passed' | 'workflow_inactive' | 'already_responded' | null;
}

export interface GuestPreferencesDetails {
  /** Questions the planner configured for this event. */
  requirements: GuestRequirementField[];
  guest_name: string;
  event_name: string;
  event_date: string;
  venue: string;
  preferences_deadline: string | null;
  allow_plus_one: boolean;
  collect_aso_ebi: boolean;
  /** Resolved organiser wording, already defaulted server-side. */
  plus_one_term: string;
  aso_ebi_term: string;
  aso_ebi_unit_term: string;
  collect_celebrant: boolean;
  celebrant_options: string[];
  plus_one_attending: boolean;
  plus_one_full_name: string;
  plus_one_phone_number: string;
  aso_ebi_requested: boolean;
  aso_ebi_quantity: number;
  celebrant_name: string;
  submitted_at: string | null;
  can_respond: boolean;
  closed_reason: 'collection_disabled' | 'deadline_passed' | 'event_ended' | null;
}


/** A question an event asks its guests (Aso Ebi, meal choice, shuttle seat...). */
export type RequirementKind = 'boolean' | 'quantity' | 'choice' | 'multi_choice' | 'text';
export type RequirementAppliesTo = 'primary' | 'everyone';
export type RequirementCollectOn = 'rsvp' | 'preferences' | 'both';

export interface GuestRequirement {
  id: number;
  event: number;
  key: string;
  label: string;
  help_text: string;
  kind: RequirementKind;
  /** choice / multi_choice only */
  options: string[];
  /** quantity only */
  unit: string;
  required: boolean;
  applies_to: RequirementAppliesTo;
  collect_on: RequirementCollectOn;
  position: number;
  is_active: boolean;
  created_at: string;
  /** How many guests have answered. Read-only. */
  response_count: number;
}

/** A starting point offered by the builder; copied into the event when chosen. */
export interface GuestRequirementPreset {
  key: string;
  label: string;
  help_text: string;
  kind: RequirementKind;
  options: string[];
  unit: string;
  applies_to: RequirementAppliesTo;
}


/** A question as sent to a guest-facing page, with their current answer. */
export interface GuestRequirementField {
  id: number;
  key: string;
  label: string;
  help_text: string;
  kind: RequirementKind;
  options: string[];
  /** Resolved unit for quantity questions; empty for other kinds. */
  unit: string;
  required: boolean;
  /** What the guest previously answered, or null. */
  value: boolean | number | string | string[] | null;
}

/** requirement key -> the guest's answer, in the shape the server expects. */
export type RequirementAnswerMap = Record<string, unknown>;


/** One table block inside a seating section. */
export interface SeatingTable {
  id: number;
  section: number;
  event: number;
  label: string;
  shape: 'round' | 'rectangle';
  seats: number;
  /** Offset from the owning section's origin, in plan units. */
  x: number;
  y: number;
  position: number;
  created_at: string;
  /** Guests whose table_number matches this block's label. */
  assigned: number;
}

/** Fixtures on the floor plan that nobody is seated at. */
export type SeatingFeature =
  | 'stage' | 'dancefloor' | 'walkway' | 'path' | 'entrance' | 'exit'
  | 'guestexit' | 'serviceexit'
  | 'bar' | 'buffet' | 'cake' | 'gifts' | 'photo' | 'restroom'
  | 'area' | 'restricted' | 'other';

export interface SeatingPathPoint {
  /** Coordinates normalised to the route object's width and height. */
  x: number;
  y: number;
}

/** A block on the plan: either a group of tables or a venue feature. */
export interface SeatingSection {
  id: number;
  event: number;
  name: string;
  /** "tables" holds seats; "feature" is the band, a walkway, an exit. */
  kind: 'tables' | 'feature';
  /** Which fixture this is, when kind is "feature". */
  feature: SeatingFeature | '';
  /** Short code used to build table labels, e.g. GF gives GF-01. */
  prefix: string;
  x: number;
  y: number;
  /** Explicit size in plan units; null means "fit the tables". */
  width: number | null;
  height: number | null;
  /** Bendable geometry for a route feature. */
  path_points: SeatingPathPoint[];
  /** Arrowheads on a route: none, at the end, or at both ends. */
  path_arrows: 'none' | 'end' | 'both';
  /** Optional connector anchors. An anchored end follows the block it is
   *  attached to, so moving that block keeps the route joined. */
  path_start_section: number | null;
  path_end_section: number | null;
  path_start_table: number | null;
  path_end_table: number | null;
  columns: number;
  is_reserved: boolean;
  note: string;
  position: number;
  created_at: string;
  tables: SeatingTable[];
}

/** Fields accepted when creating a section along with its tables. */
export interface CreateSeatingSectionPayload {
  event: number;
  name: string;
  kind?: 'tables' | 'feature';
  feature?: SeatingFeature;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  prefix?: string;
  columns?: number;
  is_reserved?: boolean;
  table_count?: number;
  seats_per_table?: number;
  shape?: 'round' | 'rectangle';
  path_points?: SeatingPathPoint[];
  path_arrows?: 'none' | 'end' | 'both';
}

/** Who is at a table, and who is still waiting to be seated. */
export interface SeatingTableGuests {
  assigned: Array<{ id: string; full_name: string; seat_number: string; status: string }>;
  unassigned: Array<{ id: string; full_name: string; status: string }>;
  seats: number;
}


/** A route drawn across a seating plan: an aisle, a service run, an exit route. */
export interface SeatingPath {
  id: number;
  event: number;
  label: string;
  style: 'aisle' | 'service' | 'procession' | 'exit_route';
  arrows: 'none' | 'end' | 'both';
  curved: boolean;
  /** Stroke width in plan units. */
  width: number;
  /** Bend points as [x, y] pairs. Two points is a straight line. */
  points: Array<[number, number]>;
  position: number;
  created_at: string;
  /** Optional anchors — an anchored end follows the block it is attached to. */
  start_section: number | null;
  start_table: number | null;
  end_section: number | null;
  end_table: number | null;
}


/** One guest's answer to one configured question. */
export interface PreferenceAnswer {
  requirement_id: number;
  key: string;
  label: string;
  kind: 'boolean' | 'quantity' | 'choice' | 'multi_choice' | 'text';
  /** Already formatted for display — "5 yards", "Nuts, Dairy", "Yes". */
  value: string;
  answered: boolean;
}

/** A guest row on the preference dashboard, with every answer they gave. */
export interface PreferenceGuest {
  id: string;
  full_name: string;
  phone_number: string;
  ticket_type: string;
  table_number: string;
  status: string;
  submitted_at: string | null;
  aso_ebi_requested: boolean;
  aso_ebi_quantity: number;
  plus_one_attending: boolean;
  answers: PreferenceAnswer[];
}

/** Totals for one question, in the shape a vendor order needs. */
export interface PreferenceQuestionTotal {
  id: number;
  key: string;
  label: string;
  kind: PreferenceAnswer['kind'];
  unit: string;
  answered: number;
  /** Number of option selections; can exceed answered for multi-choice questions. */
  selection_count: number;
  breakdown: Array<{ label: string; count: number }>;
  /** Quantity questions only — the summed total, e.g. yards of fabric. */
  total: number | null;
}

export interface PreferenceSeatingGuest {
  id: string;
  full_name: string;
  seat_number: string;
  checked_in: boolean;
  submitted: boolean;
  answers: Array<{
    requirement_id: number;
    label: string;
    kind: PreferenceAnswer['kind'];
    value: string;
  }>;
}

/** One operational service card, collated from guests assigned to a table. */
export interface PreferenceSeatingTable {
  section_id: number | null;
  section_name: string;
  table_id: number | null;
  table_label: string;
  seats: number;
  unassigned: boolean;
  guest_count: number;
  checked_in_count: number;
  responded_count: number;
  totals: PreferenceQuestionTotal[];
  guests: PreferenceSeatingGuest[];
}

/** Everything the preference dashboard renders, fetched as one payload. */
export interface PreferenceDashboard {
  summary: { total: number; submitted: number; outstanding: number };
  legacy: {
    aso_ebi_guests: number;
    aso_ebi_quantity: number;
    /** True when a configured question owns the Aso Ebi total instead. */
    aso_ebi_superseded: boolean;
    plus_ones: number;
  };
  questions: PreferenceQuestionTotal[];
  seating: PreferenceSeatingTable[];
  columns: Array<{ id: number; key: string; label: string; kind: PreferenceAnswer['kind']; unit: string }>;
  guests: PreferenceGuest[];
}

// --- Messaging settings ----------------------------------------------------

/** Numeric settings take a number; the two backoff schedules take hour lists. */
export type MessagingSettingsValue = number | number[]

export interface MessagingSettingsField<T extends MessagingSettingsValue = MessagingSettingsValue> {
  /** The value actually in force, after the platform default is applied. */
  value: T
  /** This workspace's own value, or null when it inherits the default. */
  override: T | null
  /** The platform default behind the effective value. */
  default: T
  source: 'organization' | 'platform'
  min: number | null
  max: number | null
}

export type MessagingSettingsFieldName =
  | 'daily_send_limit'
  | 'whatsapp_messages_per_minute'
  | 'rsvp_messages_per_minute'
  | 'rsvp_max_reminders'
  | 'rsvp_reminder_cooldown_minutes'
  | 'failed_send_max_auto_retries'
  | 'failed_send_retry_delay_hours'
  | 'ecosystem_retry_delay_hours'

export interface MessagingSettingsPayload {
  organization: number
  organization_name: string
  fields: Record<MessagingSettingsFieldName, MessagingSettingsField>
  updated_at: string | null
  updated_by: string | null
  /**
   * Read-only. Celery binds a task's rate limit when the worker imports the
   * module, so this is a global ceiling that only changes on a worker restart.
   */
  worker_rate_limit: {
    per_worker_per_minute: number
    requires_worker_restart: boolean
    env_var: string
  }
}

/** null clears the override and restores the platform default. */
export type MessagingSettingsUpdate = Partial<
  Record<MessagingSettingsFieldName, MessagingSettingsValue | null>
>

export interface MessagingSettingsAuditEntry {
  id: number
  field: string
  old_value: string
  new_value: string
  changed_by: string
  changed_at: string
}

export type OrganizationDomainType = 'platform_subdomain' | 'custom_subdomain' | 'apex_domain'
export type OrganizationDomainStatus = 'pending' | 'verified' | 'active' | 'failed'

export interface OrganizationDomainDnsRecord {
  type: 'TXT' | 'CNAME' | 'A' | 'ALIAS'
  name: string
  value: string
  purpose: string
}

/** A hostname that serves the organization's public pages (RSVP first). */
export interface OrganizationDomain {
  id: number
  hostname: string
  type: OrganizationDomainType
  type_display: string
  status: OrganizationDomainStatus
  status_display: string
  /** Guest links are generated on the primary domain. */
  is_primary: boolean
  url: string
  /** Records still to be added at the DNS provider; empty for platform subdomains. */
  dns_records: OrganizationDomainDnsRecord[]
  verified_at: string | null
  activated_at: string | null
  last_checked_at: string | null
  last_check_message: string
  created_at: string
}
