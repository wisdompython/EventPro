import secrets
import uuid
from django.db import models
from accounts.models import get_default_organization_id


PREFERENCE_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'


def generate_preference_code():
    """Return a compact, URL-safe, non-sequential preferences access code."""
    return ''.join(secrets.choice(PREFERENCE_CODE_ALPHABET) for _ in range(6))


class Font(models.Model):
    organization = models.ForeignKey(
        'accounts.Organization',
        on_delete=models.CASCADE,
        related_name='fonts',
        default=get_default_organization_id,
    )
    name = models.CharField(max_length=100)
    file = models.FileField(upload_to='fonts/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'name'],
                name='unique_font_name_per_organization',
            ),
        ]

    def __str__(self):
        return self.name


class Event(models.Model):
    organization = models.ForeignKey(
        'accounts.Organization',
        on_delete=models.CASCADE,
        related_name='events',
        default=get_default_organization_id,
    )
    name = models.CharField(max_length=255)
    date = models.DateTimeField()
    venue = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    rsvp_message = models.TextField(
        blank=True,
        help_text='Guest-facing welcome message shown on the public RSVP page.',
    )
    color_of_day = models.CharField(
        max_length=255,
        blank=True,
        help_text='Optional dress colour or event colour shown on the RSVP page.',
    )
    rsvp_primary_color = models.CharField(
        max_length=20,
        default='#8a6f2b',
        help_text='Primary accent colour for the public RSVP page.',
    )
    rsvp_background_color = models.CharField(
        max_length=20,
        default='#f6f4ee',
        help_text='Page background colour for the public RSVP page.',
    )
    rsvp_card_color = models.CharField(
        max_length=20,
        default='#ffffff',
        help_text='Card and form background colour for the public RSVP page.',
    )
    rsvp_text_color = models.CharField(
        max_length=20,
        default='#23262e',
        help_text='Primary text colour for the public RSVP page.',
    )
    rsvp_background_image = models.ImageField(
        upload_to='rsvp_backgrounds/',
        blank=True,
        null=True,
        help_text='Optional full-page background image for the public RSVP page.',
    )
    # Admins upload one design per event; all guest passes are rendered on top of it
    design_template = models.ImageField(upload_to='design_templates/', blank=True, null=True)

    # QR zone — stored as fractions (0.0–1.0) of the template dimensions so they
    # scale correctly regardless of the actual image resolution.
    qr_zone_x = models.FloatField(null=True, blank=True)
    qr_zone_y = models.FloatField(null=True, blank=True)
    qr_zone_w = models.FloatField(null=True, blank=True)
    qr_zone_h = models.FloatField(null=True, blank=True)

    # Name zone — where the guest's name is drawn on the pass
    name_zone_x = models.FloatField(null=True, blank=True)
    name_zone_y = models.FloatField(null=True, blank=True)
    name_zone_w = models.FloatField(null=True, blank=True)
    name_zone_h = models.FloatField(null=True, blank=True)

    # Name typography settings
    name_font = models.ForeignKey(Font, null=True, blank=True, on_delete=models.SET_NULL, related_name='events')
    name_font_color = models.CharField(max_length=20, default='#ffffff')
    name_font_size_fraction = models.FloatField(default=0.05)  # fraction of template height

    # QR backing — 'none' means no backing, any CSS hex like '#ffffff' adds a solid pad
    QR_BG_NONE = 'none'
    qr_bg_color = models.CharField(max_length=20, default='none', blank=True)

    # Per-event guest configuration
    # ticket_types: [{"value": "vip", "label": "VIP"}, ...]  — defines allowed ticket categories
    ticket_types = models.JSONField(
        default=list,
        blank=True,
        help_text='List of {value, label} objects defining ticket categories for this event.',
    )
    # required_fields: subset of ["full_name", "phone_number", "email", "table_number", "seat_number"]
    required_fields = models.JSONField(
        default=list,
        blank=True,
        help_text='Guest fields that are required for this event.',
    )
    collect_aso_ebi = models.BooleanField(
        default=False,
        help_text='Allow guests to request Aso Ebi and specify a quantity.',
    )
    allow_plus_one = models.BooleanField(
        default=False,
        help_text='Allow confirmed guests to indicate that they will bring one additional guest.',
    )
    # Wording shown to guests and staff. "Aso Ebi" and "plus one" do not suit
    # every event (a corporate dinner says "guest", a conference says "fabric"
    # not at all), so each organiser can rename them per event. Blank means
    # "use the default", which keeps existing events reading exactly as before.
    plus_one_label = models.CharField(
        max_length=40,
        blank=True,
        help_text='What to call an additional guest, e.g. "Plus one", "Guest", "Partner". Blank uses "Plus one".',
    )
    aso_ebi_label = models.CharField(
        max_length=40,
        blank=True,
        help_text='What to call the fabric or uniform request, e.g. "Aso Ebi", "Fabric". Blank uses "Aso Ebi".',
    )
    aso_ebi_unit = models.CharField(
        max_length=20,
        blank=True,
        help_text='Unit for the quantity requested, e.g. "yards", "metres", "sets". Blank uses "yards".',
    )
    preferences_enabled = models.BooleanField(
        default=False,
        help_text='Collect guest preferences without requiring RSVP confirmation.',
    )
    preferences_deadline = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Last time guests may submit the standalone preferences form.',
    )
    collect_celebrant = models.BooleanField(
        default=False,
        help_text='Ask guests which celebrant they are attending for.',
    )
    celebrant_options = models.JSONField(
        default=list,
        blank=True,
        help_text='Optional predetermined celebrant names. Guests enter a custom name when empty.',
    )
    # When False, WhatsApp delivery is not expected and phone_number is not auto-required
    whatsapp_enabled = models.BooleanField(default=True)
    # RSVP is an event-level delivery decision. It intentionally survives deletion
    # of an individual workflow so guests cannot fall through to direct pass sends.
    rsvp_enabled = models.BooleanField(default=False)
    # Optional override — if set, this template is used for pass delivery instead of the global default
    whatsapp_template = models.ForeignKey(
        'WhatsAppTemplate',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='events',
        help_text='WhatsApp template to use for this event. Falls back to the global default if not set.',
    )
    # Default delivery time for the original (non-RSVP) workflow. New guests
    # inherit this value, while a per-guest scheduled_send_at can still override it.
    pass_send_at = models.DateTimeField(null=True, blank=True)
    is_ended = models.BooleanField(default=False)

    # Seating plans use their own coordinate space. Keeping the canvas size on
    # the event lets planners widen or deepen a venue and retain that work
    # across devices instead of deriving the room solely from its contents.
    seating_plan_width = models.PositiveIntegerField(default=1400)
    seating_plan_height = models.PositiveIntegerField(default=950)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


    @property
    def plus_one_term(self) -> str:
        return self.plus_one_label.strip() or 'Plus one'

    @property
    def aso_ebi_term(self) -> str:
        return self.aso_ebi_label.strip() or 'Aso Ebi'

    @property
    def aso_ebi_unit_term(self) -> str:
        return self.aso_ebi_unit.strip() or 'yards'


class Guest(models.Model):
    class Status(models.TextChoices):
        REGISTERED = 'registered', 'Registered'
        CHECKED_IN = 'checked_in', 'Checked In'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='guests')
    plus_one_of = models.OneToOneField(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='named_plus_one',
        help_text='Primary guest who supplied this named plus one.',
    )
    full_name = models.CharField(max_length=255)
    # phone_number is optional at the DB level; required-ness is governed by event.required_fields
    phone_number = models.CharField(max_length=20, blank=True)

    email = models.EmailField(blank=True)
    # ticket_type is a free-text field validated against event.ticket_types at the API level
    ticket_type = models.CharField(max_length=50, blank=True, default='general')
    table_number = models.CharField(max_length=50, blank=True)
    seat_number = models.CharField(max_length=50, blank=True)
    aso_ebi_requested = models.BooleanField(default=False)
    aso_ebi_quantity = models.PositiveIntegerField(default=0)
    plus_one_attending = models.BooleanField(default=False)
    celebrant_name = models.CharField(max_length=255, blank=True)
    preference_code = models.CharField(
        max_length=6,
        default=generate_preference_code,
        unique=True,
        editable=False,
    )
    preference_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    preferences_submitted_at = models.DateTimeField(null=True, blank=True)
    plus_one_checked_in = models.BooleanField(default=False)
    plus_one_checked_in_at = models.DateTimeField(null=True, blank=True)

    # Generated assets — created automatically after registration
    qr_code = models.ImageField(upload_to='qr_codes/', blank=True, null=True)
    pass_image = models.ImageField(upload_to='passes/', blank=True, null=True)

    # State
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REGISTERED)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    whatsapp_sent = models.BooleanField(default=False)
    whatsapp_sent_at = models.DateTimeField(null=True, blank=True)
    # If set, the WhatsApp pass is held back and sent by dispatch_scheduled_sends
    # once this time arrives, instead of immediately on registration.
    scheduled_send_at = models.DateTimeField(null=True, blank=True)
    # Set the moment dispatch_scheduled_sends claims this guest for sending, so a
    # slow queue (task not yet run) doesn't get re-claimed by the next Beat tick.
    scheduled_send_claimed_at = models.DateTimeField(null=True, blank=True)
    registered_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.full_name} — {self.ticket_type or 'guest'}"


class GuestRequirement(models.Model):
    """A question an event asks its guests.

    Aso Ebi, a meal choice, a shuttle seat and a dietary note are all the same
    shape of thing: a question with a typed answer that the planner needs to
    total up and hand to a vendor. Modelling that shape once means a new kind of
    question is configuration rather than a migration plus seven code changes.

    Tenancy is inherited through ``event``, matching Guest.
    """

    class Kind(models.TextChoices):
        BOOLEAN = 'boolean', 'Yes / no'
        QUANTITY = 'quantity', 'Quantity'
        CHOICE = 'choice', 'Single choice'
        MULTI_CHOICE = 'multi_choice', 'Multiple choice'
        TEXT = 'text', 'Short text'

    class AppliesTo(models.TextChoices):
        # One answer per invitation. Fabric is usually ordered once for a couple.
        PRIMARY = 'primary', 'Primary guest only'
        # Every attendee answers for themselves. A companion eats their own meal.
        EVERYONE = 'everyone', 'Every attending guest'

    class CollectOn(models.TextChoices):
        RSVP = 'rsvp', 'RSVP page'
        PREFERENCES = 'preferences', 'Preferences form'
        BOTH = 'both', 'Both'

    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name='requirements',
    )
    # Stable identifier used by exports and the backfill. Unique per event so a
    # column heading keeps meaning the same thing even if the label is reworded.
    key = models.SlugField(max_length=50)
    label = models.CharField(max_length=120)
    help_text = models.CharField(max_length=255, blank=True)

    kind = models.CharField(max_length=20, choices=Kind.choices)
    # CHOICE / MULTI_CHOICE only: the options a guest picks from.
    options = models.JSONField(default=list, blank=True)
    # QUANTITY only: what is being counted, e.g. "yards", "seats".
    unit = models.CharField(max_length=20, blank=True)

    required = models.BooleanField(
        default=False,
        help_text='Guests must answer before their response is accepted.',
    )
    applies_to = models.CharField(
        max_length=20,
        choices=AppliesTo.choices,
        default=AppliesTo.EVERYONE,
    )
    collect_on = models.CharField(
        max_length=20,
        choices=CollectOn.choices,
        default=CollectOn.BOTH,
    )
    position = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['position', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['event', 'key'],
                name='unique_requirement_key_per_event',
            ),
        ]

    def __str__(self):
        return f'{self.label} ({self.event.name})'

    @property
    def unit_term(self) -> str:
        return self.unit.strip() or 'units'

    def applies_to_guest(self, guest) -> bool:
        """Whether this question should be asked of a particular guest."""
        if self.applies_to == self.AppliesTo.EVERYONE:
            return True
        return guest.plus_one_of_id is None


class GuestRequirementResponse(models.Model):
    """One guest's current answer to one requirement.

    Deliberately current-state only: there is no history table and no previous
    values. Re-answering overwrites.

    Values live in typed columns rather than a single JSON blob so that totals
    stay database work - SUM(value_int) for fabric, GROUP BY value_text for meal
    choices - instead of loading every row to parse it in Python.
    """

    requirement = models.ForeignKey(
        GuestRequirement,
        on_delete=models.CASCADE,
        related_name='responses',
    )
    guest = models.ForeignKey(
        'Guest',
        on_delete=models.CASCADE,
        related_name='requirement_responses',
    )

    value_bool = models.BooleanField(null=True, blank=True)
    value_int = models.PositiveIntegerField(null=True, blank=True)
    value_text = models.CharField(max_length=255, blank=True)
    value_json = models.JSONField(default=list, blank=True)

    responded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['requirement__position', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['requirement', 'guest'],
                name='unique_response_per_guest_requirement',
            ),
        ]
        indexes = [
            models.Index(fields=['requirement', 'value_text']),
        ]

    def __str__(self):
        return f'{self.guest.full_name}: {self.requirement.label}'

    @property
    def display_value(self) -> str:
        """Human-readable answer, used by exports and the dashboard."""
        kind = self.requirement.kind
        if kind == GuestRequirement.Kind.BOOLEAN:
            return 'Yes' if self.value_bool else 'No'
        if kind == GuestRequirement.Kind.QUANTITY:
            if not self.value_int:
                return ''
            return f'{self.value_int} {self.requirement.unit_term}'
        if kind == GuestRequirement.Kind.MULTI_CHOICE:
            return ', '.join(self.value_json or [])
        return self.value_text

    @property
    def has_answer(self) -> bool:
        """Whether the guest actually supplied something.

        A false boolean is a real answer ("no, I do not need a shuttle"), so it
        counts; an unset one does not.
        """
        kind = self.requirement.kind
        if kind == GuestRequirement.Kind.BOOLEAN:
            return self.value_bool is not None
        if kind == GuestRequirement.Kind.QUANTITY:
            return bool(self.value_int)
        if kind == GuestRequirement.Kind.MULTI_CHOICE:
            return bool(self.value_json)
        return bool(self.value_text)


class EventReminder(models.Model):
    """A reminder rule attached to an event. Fires X hours before the event."""
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='reminders')
    hours_before = models.PositiveIntegerField(
        help_text='How many hours before the event to send this reminder (e.g. 168 = 7 days, 24 = 1 day).'
    )
    template_name = models.CharField(
        max_length=100,
        help_text='Approved Meta WhatsApp template name to use for this reminder.',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['hours_before']
        unique_together = [('event', 'hours_before')]

    def __str__(self):
        days = self.hours_before // 24
        hours = self.hours_before % 24
        label = f"{days}d " if days else ""
        label += f"{hours}h" if hours else ""
        return f"{self.event.name} — {label.strip()} before"


class ReminderLog(models.Model):
    """Records that a specific reminder was sent to a specific guest."""
    reminder = models.ForeignKey(EventReminder, on_delete=models.CASCADE, related_name='logs')
    guest = models.ForeignKey(Guest, on_delete=models.CASCADE, related_name='reminder_logs')
    sent_at = models.DateTimeField(auto_now_add=True)
    success = models.BooleanField(default=False)
    # Set when the send task is dispatched; a fresh claim keeps the next Beat
    # run from re-queueing the same guest and counts against the send budget.
    queued_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [('reminder', 'guest')]

    def __str__(self):
        return f"{self.reminder} → {self.guest.full_name}"


class BulkUpload(models.Model):
    class UploadStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PROCESSING = 'processing', 'Processing'
        DONE = 'done', 'Done'
        FAILED = 'failed', 'Failed'

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='bulk_uploads')
    csv_file = models.FileField(upload_to='bulk_uploads/')
    uploaded_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True
    )
    status = models.CharField(max_length=20, choices=UploadStatus.choices, default=UploadStatus.PENDING)
    replace_existing = models.BooleanField(default=False)
    total_rows = models.PositiveIntegerField(default=0)
    successful_rows = models.PositiveIntegerField(default=0)
    failed_rows = models.PositiveIntegerField(default=0)
    skipped_rows = models.PositiveIntegerField(default=0)
    replaced_rows = models.PositiveIntegerField(default=0)
    recipients_created = models.PositiveIntegerField(default=0)
    assets_total = models.PositiveIntegerField(default=0)
    assets_processed = models.PositiveIntegerField(default=0)
    assets_failed = models.PositiveIntegerField(default=0)
    error_report = models.JSONField(default=list, blank=True)
    skipped_report = models.JSONField(default=list, blank=True)
    error_message = models.TextField(blank=True)
    task_id = models.CharField(max_length=255, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Upload for {self.event} ({self.status})"


class TemplateCategory(models.Model):
    """Grouping label for WhatsApp templates (e.g. Birthday, Wedding, Corporate)."""
    organization = models.ForeignKey(
        'accounts.Organization',
        on_delete=models.CASCADE,
        related_name='template_categories',
        default=get_default_organization_id,
    )
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'template categories'
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'name'],
                name='unique_template_category_per_organization',
            ),
        ]

    def __str__(self):
        return self.name


class WhatsAppTemplate(models.Model):
    """Registry of approved Meta WhatsApp templates available for use."""

    AVAILABLE_VARS = [
        ('guest_name',  'Guest full name'),
        ('event_name',  'Event name'),
        ('event_date',  'Event date & time'),
        ('event_date_only', 'Event date only'),
        ('event_time',  'Event time only'),
        ('venue',       'Event venue'),
        ('ticket_type', 'Guest ticket type'),
        ('table_number','Guest table number'),
        ('seat_number', 'Guest seat number'),
        ('rsvp_link',   'Guest-specific RSVP link'),
        ('preferences_link', 'Guest preferences link'),
        ('rsvp_deadline', 'RSVP response deadline'),
    ]

    organization = models.ForeignKey(
        'accounts.Organization',
        on_delete=models.CASCADE,
        related_name='whatsapp_templates',
        default=get_default_organization_id,
    )
    name         = models.CharField(max_length=200, help_text="Exact template name as in Meta Business Manager")
    display_name = models.CharField(max_length=200, blank=True, help_text="Friendly label shown in the UI")
    description  = models.TextField(blank=True)
    category     = models.ForeignKey(
        TemplateCategory,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='templates',
        help_text='Optional category for grouping templates.',
    )
    # The raw template body as approved in Meta, with {{1}}, {{2}} placeholders
    body_text    = models.TextField(blank=True, help_text="Template body text with {{1}}, {{2}} placeholders — used for preview only")
    # Ordered list of variable keys to pass as body params, e.g. ["guest_name", "event_name", "event_date"]
    body_params  = models.JSONField(default=list, blank=True, help_text="Ordered list of variable keys for body params")
    has_header_image = models.BooleanField(default=False, help_text="Template has a header image (pass image will be sent)")
    is_active    = models.BooleanField(default=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['category__name', 'display_name', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'name'],
                name='unique_whatsapp_template_per_organization',
            ),
        ]

    def __str__(self):
        return self.display_name or self.name


class SeatingSection(models.Model):
    """A named group of tables — "High table", "Grooms family", "Sponsors".

    Sections are how planners actually think about a room: a block of tables
    set aside for one kind of guest. Creating a section creates its tables in
    one step, and moving the section moves them together.

    The prefix makes table labels self-describing: a section named "Grooms
    family" with prefix GF numbers its tables GF-01, GF-02, ... so a table
    number on a pass or an export says which part of the room it belongs to.

    Tenancy is inherited through ``event``, matching Guest.
    """

    class Kind(models.TextChoices):
        # Holds tables guests are seated at.
        TABLES = 'tables', 'Tables'
        # Everything else on the floor plan: the band, a walkway, an exit.
        # These take up room and need labelling, but nobody is seated at them.
        FEATURE = 'feature', 'Venue feature'

    class Feature(models.TextChoices):
        STAGE = 'stage', 'Stage / band'
        DANCEFLOOR = 'dancefloor', 'Dance floor'
        WALKWAY = 'walkway', 'Walkway / aisle'
        PATH = 'path', 'Route / path'
        ENTRANCE = 'entrance', 'Entrance'
        EXIT = 'exit', 'Exit'
        GUEST_EXIT = 'guestexit', 'Guest exit'
        SERVICE_EXIT = 'serviceexit', 'Service exit'
        BAR = 'bar', 'Bar'
        BUFFET = 'buffet', 'Buffet / catering'
        CAKE = 'cake', 'Cake table'
        GIFTS = 'gifts', 'Gift table'
        PHOTO = 'photo', 'Photo booth'
        RESTROOM = 'restroom', 'Restrooms'
        AREA = 'area', 'Area boundary'
        RESTRICTED = 'restricted', 'Restricted area'
        OTHER = 'other', 'Other'

    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name='seating_sections',
    )
    name = models.CharField(max_length=80)
    kind = models.CharField(
        max_length=20,
        choices=Kind.choices,
        default=Kind.TABLES,
    )
    # FEATURE only: which kind of fixture this is, so the plan can draw it
    # recognisably and the planner can filter by it.
    feature = models.CharField(
        max_length=20,
        choices=Feature.choices,
        blank=True,
    )
    # Short code used to build table labels. Derived from the name when the
    # planner does not supply one.
    # Only table sections build labels from a prefix; features leave it blank.
    prefix = models.CharField(max_length=8, blank=True)
    # Position of the whole group on the plan; tables are placed relative to it.
    x = models.FloatField(default=0)
    y = models.FloatField(default=0)
    # Tables per row when the section lays its tables out.
    columns = models.PositiveIntegerField(default=3)
    # Explicit size in plan units. Null means "fit the tables", which is what a
    # freshly created section does until the planner resizes it by hand.
    width = models.FloatField(null=True, blank=True)
    height = models.FloatField(null=True, blank=True)
    # FEATURE/path only: bend points stored as normalised coordinates within
    # the section, e.g. [{"x": 0.05, "y": 0.5}, ...]. Normalised values let
    # the route scale naturally when its bounding box is resized.
    path_points = models.JSONField(default=list, blank=True)
    # FEATURE/path only: optional anchors turning a route into a connector.
    # An anchored end tracks the block it is attached to, so moving that block
    # keeps the route joined instead of leaving it dangling. Self-referential
    # to SeatingSection, so a route can join two sections; the table variants
    # pin an end to one specific table.
    path_start_section = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='routes_starting_here',
    )
    path_end_section = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='routes_ending_here',
    )
    path_start_table = models.ForeignKey(
        'SeatingTable', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='routes_starting_here',
    )
    path_end_table = models.ForeignKey(
        'SeatingTable', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='routes_ending_here',
    )
    # Arrowheads: none, at the end, or at both ends.
    path_arrows = models.CharField(
        max_length=10,
        choices=[('none', 'No arrows'), ('end', 'Arrow at the end'), ('both', 'Both ends')],
        default='end',
    )
    # Reserved sections (high table, family) render differently so priority
    # zones are visible at a glance.
    is_reserved = models.BooleanField(
        default=False,
        help_text='Marks a priority zone such as the high table.',
    )
    note = models.CharField(max_length=255, blank=True)
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['position', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['event', 'name'],
                name='unique_seating_section_name_per_event',
            ),
            models.UniqueConstraint(
                fields=['event', 'prefix'],
                # Venue features carry no prefix, and several blanks per event
                # must stay legal — so the rule covers real prefixes only.
                condition=~models.Q(prefix=''),
                name='unique_seating_section_prefix_per_event',
            ),
        ]

    def __str__(self):
        return f'{self.name} ({self.event.name})'


class SeatingTable(models.Model):
    """One table inside a section.

    Deliberately a block, not a seat map: planners arrange and label tables,
    then assign guests to them by name. Seat-level placement stays where it
    already lives - Guest.table_number and Guest.seat_number - so this model
    adds a plan without changing how check-in, passes or exports read seating.

    Position is stored relative to the owning section, so dragging the section
    moves every table in it without touching each row.
    """

    class Shape(models.TextChoices):
        ROUND = 'round', 'Round'
        RECTANGLE = 'rectangle', 'Rectangle'

    section = models.ForeignKey(
        SeatingSection,
        on_delete=models.CASCADE,
        related_name='tables',
    )
    # Denormalised from section.event so a table can be filtered and uniqueness
    # checked without a join on every query.
    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name='seating_tables',
    )
    # Shown on the block and matched against Guest.table_number, which is free
    # text - so this is a label, not a foreign key. Renaming a table here does
    # not silently move guests.
    label = models.CharField(max_length=50)
    shape = models.CharField(max_length=20, choices=Shape.choices, default=Shape.ROUND)
    seats = models.PositiveIntegerField(
        default=8,
        help_text='How many guests this table holds.',
    )
    # Offset from the section's origin, in plan units.
    x = models.FloatField(default=0)
    y = models.FloatField(default=0)
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['position', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['event', 'label'],
                name='unique_seating_table_label_per_event',
            ),
        ]

    def __str__(self):
        return f'{self.label} ({self.event.name})'

    @property
    def assigned_count(self) -> int:
        """Guests whose table_number matches this block's label."""
        return self.event.guests.filter(table_number=self.label).count()
