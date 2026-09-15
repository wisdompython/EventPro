from django.contrib.auth.models import AbstractUser
from django.db import models


def get_default_organization_id():
    """Compatibility owner for legacy code paths that do not yet pass a tenant.

    Request-facing writes explicitly set the active organization. This default
    preserves existing management commands and the pre-tenancy test suite while
    those internal call sites are migrated.
    """
    from django.apps import apps

    organization_model = apps.get_model('accounts', 'Organization')
    organization, _ = organization_model.objects.get_or_create(
        slug='event-pro-workspace',
        defaults={
            'name': 'Event Pro Workspace',
            'timezone': 'Africa/Lagos',
            'is_active': True,
        },
    )
    return organization.pk


class Role(models.TextChoices):
    SUPER_ADMIN    = 'super_admin',    'Super Admin'
    EVENT_MANAGER  = 'event_manager',  'Event Manager'
    CHECK_IN_STAFF = 'check_in_staff', 'Check-In Staff'
    SCANNER        = 'scanner',        'Scanner'
    VIEWER         = 'viewer',         'Viewer'


ROLE_HIERARCHY = {
    Role.SUPER_ADMIN:    5,
    Role.EVENT_MANAGER:  4,
    Role.CHECK_IN_STAFF: 3,
    Role.SCANNER:        2,
    Role.VIEWER:         1,
}


class User(AbstractUser):
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.VIEWER,
    )

    class Meta:
        ordering = ['username']

    def has_min_role(self, min_role: str) -> bool:
        return ROLE_HIERARCHY.get(self.role, 0) >= ROLE_HIERARCHY.get(min_role, 0)

    @property
    def is_super_admin(self) -> bool:
        return self.role == Role.SUPER_ADMIN or self.is_superuser

    @property
    def is_event_manager(self) -> bool:
        return self.is_superuser or self.has_min_role(Role.EVENT_MANAGER)

    @property
    def is_check_in_staff(self) -> bool:
        return self.is_superuser or self.has_min_role(Role.CHECK_IN_STAFF)

    @property
    def is_scanner(self) -> bool:
        """Scanner role — can only scan QR codes. Cannot view guest lists."""
        return self.role == Role.SCANNER


class Organization(models.Model):
    """A customer workspace that owns Event Pro data and configuration."""

    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, unique=True)
    timezone = models.CharField(max_length=64, default='Africa/Lagos')
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='organizations_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name


class MembershipRole(models.TextChoices):
    OWNER = 'owner', 'Owner'
    ADMIN = 'admin', 'Administrator'
    MANAGER = 'manager', 'Event Manager'
    CHECK_IN = 'check_in', 'Check-In Staff'
    SCANNER = 'scanner', 'Scanner'
    VIEWER = 'viewer', 'Viewer'


class Membership(models.Model):
    """A user's role inside one organization."""

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    role = models.CharField(
        max_length=20,
        choices=MembershipRole.choices,
        default=MembershipRole.VIEWER,
    )
    is_active = models.BooleanField(default=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['organization__name', 'user__username']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'user'],
                name='unique_organization_membership',
            ),
        ]

    def __str__(self):
        return f'{self.user} · {self.organization} ({self.get_role_display()})'


class OrganizationMessagingSettings(models.Model):
    """Per-organization overrides for WhatsApp / RSVP delivery behaviour.

    Every column is nullable and NULL means "inherit the platform default"
    (the env-backed values in core.settings.base). Defaults are deliberately
    *not* copied into the row on creation: an operator raising a platform
    default must see it propagate to every tenant that has not opted out.

    Never read these fields directly — go through
    ``accounts.messaging_settings.messaging_settings_for()``, which applies
    the platform defaults and the platform ceilings.
    """

    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name='messaging_settings',
    )

    # --- WhatsApp sending -------------------------------------------------
    daily_send_limit = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Meta messaging tier: unique guests this workspace may open '
                  'conversations with per rolling 24h. Blank inherits the platform default.',
    )
    whatsapp_messages_per_minute = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Pace for guest-pass sends. Applied as an in-task throttle '
                  'within the worker rate-limit ceiling.',
    )
    rsvp_messages_per_minute = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Pace for RSVP invitation and reminder sends.',
    )

    # --- RSVP reminders ---------------------------------------------------
    rsvp_max_reminders = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='How many times one guest who has not replied may be reminded.',
    )
    rsvp_reminder_cooldown_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Minimum wait between two reminders to the same guest.',
    )

    # --- Delivery retries -------------------------------------------------
    failed_send_max_auto_retries = models.PositiveIntegerField(
        null=True, blank=True,
        help_text='Automatic retries for a send Meta accepted and later reported failed.',
    )
    failed_send_retry_delay_hours = models.JSONField(
        null=True, blank=True,
        help_text='Hours to wait before each automatic retry of a transient failure. '
                  'The last entry repeats. Must be a non-empty list of positive integers.',
    )
    ecosystem_retry_delay_hours = models.JSONField(
        null=True, blank=True,
        help_text="Hours to wait before each retry of Meta's per-user marketing cap "
                  '(error 131049). The last entry repeats.',
    )

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        User,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='messaging_settings_updates',
    )

    class Meta:
        verbose_name = 'organization messaging settings'
        verbose_name_plural = 'organization messaging settings'

    def __str__(self):
        return f'Messaging settings · {self.organization}'


class MessagingSettingsAuditLog(models.Model):
    """Who changed which messaging value, from what to what, and when.

    These values control spend and deliverability, so "who raised the daily
    cap to 10000" has to be answerable. One row per field actually changed.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='messaging_settings_audit',
    )
    field = models.CharField(max_length=64)
    # Rendered values, so the log stays readable after a field's type changes
    # and can record "platform default" for a cleared override.
    old_value = models.CharField(max_length=200, blank=True)
    new_value = models.CharField(max_length=200, blank=True)
    changed_by = models.ForeignKey(
        User,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='messaging_settings_changes',
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-changed_at', '-id']
        indexes = [
            models.Index(fields=['organization', '-changed_at']),
        ]

    def __str__(self):
        return f'{self.organization} · {self.field}: {self.old_value} → {self.new_value}'
