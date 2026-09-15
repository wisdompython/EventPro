"""API shape for per-organization messaging settings.

The payload is deliberately not a plain ModelSerializer dump. An admin needs
to see three things per field to understand why a number is what it is: the
value in force, the platform default behind it, and whether this workspace has
overridden that default. The page renders "Reset to default" from exactly that.
"""
from django.conf import settings
from rest_framework import serializers

from .messaging_settings import (
    MAX_RETRY_DELAY_HOURS,
    MAX_RETRY_SCHEDULE_LENGTH,
    MIN_RETRY_DELAY_HOURS,
    OVERRIDABLE_FIELDS,
    messaging_settings_for,
    platform_bounds,
    platform_defaults,
)
from .models import MessagingSettingsAuditLog, OrganizationMessagingSettings

SCHEDULE_FIELDS = ('failed_send_retry_delay_hours', 'ecosystem_retry_delay_hours')


class RetryScheduleField(serializers.ListField):
    """A backoff schedule: a non-empty list of positive whole hours.

    retry_delay_for() indexes into this list, so an empty one would raise
    IndexError on a real send. Rejecting it here is what keeps that from
    reaching the database.
    """

    child = serializers.IntegerField(
        min_value=MIN_RETRY_DELAY_HOURS,
        max_value=MAX_RETRY_DELAY_HOURS,
    )

    def __init__(self, **kwargs):
        kwargs.setdefault('allow_null', True)
        kwargs.setdefault('required', False)
        kwargs.setdefault('min_length', 1)
        kwargs.setdefault('max_length', MAX_RETRY_SCHEDULE_LENGTH)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        if isinstance(data, (list, tuple)) and not data:
            raise serializers.ValidationError(
                'Enter at least one wait time, or clear the field to use the default.'
            )
        return super().to_internal_value(data)


class OrganizationMessagingSettingsSerializer(serializers.ModelSerializer):
    """Write shape: every field optional, null means "use the platform default"."""

    failed_send_retry_delay_hours = RetryScheduleField()
    ecosystem_retry_delay_hours = RetryScheduleField()

    class Meta:
        model = OrganizationMessagingSettings
        fields = list(OVERRIDABLE_FIELDS)
        extra_kwargs = {
            name: {'required': False, 'allow_null': True}
            for name in OVERRIDABLE_FIELDS
            if name not in SCHEDULE_FIELDS
        }

    def validate(self, attrs):
        """Enforce the platform bounds the resolver would otherwise clamp to.

        Clamping silently is fine as a defence for legacy rows, but an admin
        who types 50000 into the daily limit must be told the ceiling, not
        have the number quietly changed under them.
        """
        bounds = platform_bounds()
        errors = {}
        for name, value in attrs.items():
            if value is None or name not in bounds:
                continue
            low, high = bounds[name]
            if low is not None and value < low:
                errors[name] = [self._floor_message(name, low)]
            elif high is not None and value > high:
                errors[name] = [self._ceiling_message(name, high)]
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    @staticmethod
    def _floor_message(name, low):
        if name == 'rsvp_reminder_cooldown_minutes':
            return (
                f'Guests must have at least {low} minutes between reminders. '
                'Shorter gaps get business numbers reported and blocked.'
            )
        return f'Enter {low} or more.'

    @staticmethod
    def _ceiling_message(name, high):
        if name == 'daily_send_limit':
            return (
                f'The highest daily limit available on this platform is {high:,}. '
                'Contact support if your Meta messaging tier is genuinely higher.'
            )
        if name == 'rsvp_max_reminders':
            return (
                f'A guest can be reminded at most {high} times. More than that '
                'and guests report the number, which stops delivery for every event.'
            )
        if name in ('whatsapp_messages_per_minute', 'rsvp_messages_per_minute'):
            return (
                f'The sending speed cannot exceed {high} messages per minute, '
                'the limit configured on the sending workers.'
            )
        return f'Enter {high} or less.'


def render_setting_value(value):
    """Stable text for the audit log and the API's "default" labels."""
    if value is None:
        return 'platform default'
    if isinstance(value, (list, tuple)):
        return ', '.join(str(entry) for entry in value)
    return str(value)


def build_settings_payload(organization):
    """Full read payload: effective values, provenance, defaults and bounds."""
    row = OrganizationMessagingSettings.objects.filter(
        organization=organization,
    ).first()
    resolved = messaging_settings_for(organization.id)
    defaults = platform_defaults()
    bounds = platform_bounds()

    fields = {}
    for name in OVERRIDABLE_FIELDS:
        override = getattr(row, name, None) if row is not None else None
        effective = getattr(resolved, name)
        if isinstance(effective, tuple):
            effective = list(effective)
        default = defaults[name]
        if isinstance(default, tuple):
            default = list(default)
        low, high = bounds.get(name, (None, None))
        fields[name] = {
            'value': effective,
            'override': list(override) if isinstance(override, (list, tuple)) else override,
            'default': default,
            'source': resolved.source_for(name),
            'min': low,
            'max': high,
        }

    return {
        'organization': organization.id,
        'organization_name': organization.name,
        'fields': fields,
        'updated_at': row.updated_at if row else None,
        'updated_by': (
            row.updated_by.get_full_name() or row.updated_by.username
            if row and row.updated_by else None
        ),
        # Surfaced read-only so the page can say plainly which value needs a
        # worker restart, on the field itself.
        'worker_rate_limit': {
            'per_worker_per_minute': settings.WHATSAPP_WORKER_RATE_LIMIT_PER_MINUTE,
            'requires_worker_restart': True,
            'env_var': 'WHATSAPP_WORKER_RATE_LIMIT_PER_MINUTE',
        },
    }


class MessagingSettingsAuditLogSerializer(serializers.ModelSerializer):
    changed_by = serializers.SerializerMethodField()

    class Meta:
        model = MessagingSettingsAuditLog
        fields = ['id', 'field', 'old_value', 'new_value', 'changed_by', 'changed_at']

    def get_changed_by(self, obj):
        if obj.changed_by is None:
            return 'System'
        return obj.changed_by.get_full_name() or obj.changed_by.username
