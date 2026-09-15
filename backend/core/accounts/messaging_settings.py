"""Resolved messaging settings for one organization.

Every consumer of a configurable messaging value — dispatchers, Celery tasks,
views, the monitor — reads it through :func:`messaging_settings_for`, never
through ``settings.X``. That is what makes a per-org override take effect.

Resolution order for each value:

1. the organization's override column, when it is not NULL;
2. the platform default from ``core.settings.base`` (env-backed);

then clamped to the platform bounds, so a value that was valid when it was
saved cannot outlive a ceiling that has since been lowered.

The result is cached per request/task because dispatchers call it inside loops
that run every five minutes over many rows. Call :func:`clear_cache` after a
write; the API does this for you.
"""
from dataclasses import dataclass, field
from datetime import timedelta
from threading import local

from django.conf import settings

# Bounds shared by the resolver and the serializer, so the API rejects what the
# resolver would otherwise silently clamp.
MIN_DAILY_SEND_LIMIT = 1
MIN_MESSAGES_PER_MINUTE = 1
MIN_RSVP_MAX_REMINDERS = 1
MIN_RETRY_DELAY_HOURS = 1
MAX_RETRY_DELAY_HOURS = 24 * 14
MAX_RETRY_SCHEDULE_LENGTH = 10

# Fields an organization may override, and the platform-default setting each
# one falls back to. The API, the serializer and the audit log all derive from
# this map, so adding a setting means adding one entry here.
FIELD_DEFAULTS = {
    'daily_send_limit': 'WHATSAPP_DAILY_SEND_LIMIT',
    'whatsapp_messages_per_minute': 'WHATSAPP_MESSAGES_PER_MINUTE',
    'rsvp_messages_per_minute': 'RSVP_MESSAGES_PER_MINUTE',
    'rsvp_max_reminders': 'RSVP_MAX_REMINDERS',
    'rsvp_reminder_cooldown_minutes': 'RSVP_REMINDER_COOLDOWN_MINUTES',
    'failed_send_max_auto_retries': 'FAILED_SEND_MAX_AUTO_RETRIES',
    'failed_send_retry_delay_hours': 'FAILED_SEND_RETRY_DELAY_HOURS',
    'ecosystem_retry_delay_hours': 'ECOSYSTEM_RETRY_DELAY_HOURS',
}

OVERRIDABLE_FIELDS = tuple(FIELD_DEFAULTS)

_state = local()


def _clamp(value, low, high):
    if high is not None and value > high:
        return high
    if low is not None and value < low:
        return low
    return value


def _clean_schedule(value, fallback):
    """Coerce a stored backoff list to a usable, non-empty tuple of hours.

    ``retry_delay_for()`` indexes into this schedule, so an empty or malformed
    list would raise IndexError on a real send. Validation at the API keeps
    bad data out; this is the second line of defence for rows written before
    that validation existed, or straight through the Django admin.
    """
    if not isinstance(value, (list, tuple)) or not value:
        value = fallback
    hours = []
    for entry in value:
        try:
            hour = int(entry)
        except (TypeError, ValueError):
            continue
        if hour < MIN_RETRY_DELAY_HOURS:
            continue
        hours.append(min(hour, MAX_RETRY_DELAY_HOURS))
    if not hours:
        hours = [int(entry) for entry in fallback]
    return tuple(hours[:MAX_RETRY_SCHEDULE_LENGTH])


def platform_defaults():
    """The platform-wide fallback for every overridable field."""
    return {
        name: getattr(settings, setting_name)
        for name, setting_name in FIELD_DEFAULTS.items()
    }


def platform_bounds():
    """Min/max the API enforces and the resolver clamps to."""
    return {
        'daily_send_limit': (MIN_DAILY_SEND_LIMIT, settings.WHATSAPP_DAILY_SEND_LIMIT_CEILING),
        'whatsapp_messages_per_minute': (
            MIN_MESSAGES_PER_MINUTE, settings.WHATSAPP_WORKER_RATE_LIMIT_PER_MINUTE,
        ),
        'rsvp_messages_per_minute': (
            MIN_MESSAGES_PER_MINUTE, settings.WHATSAPP_WORKER_RATE_LIMIT_PER_MINUTE,
        ),
        'rsvp_max_reminders': (MIN_RSVP_MAX_REMINDERS, settings.RSVP_MAX_REMINDERS_CEILING),
        'rsvp_reminder_cooldown_minutes': (settings.RSVP_REMINDER_COOLDOWN_FLOOR_MINUTES, None),
        'failed_send_max_auto_retries': (0, settings.FAILED_SEND_MAX_AUTO_RETRIES_CEILING),
    }


@dataclass(frozen=True)
class ResolvedMessagingSettings:
    """Effective values for one organization, with their provenance."""

    organization_id: int | None
    daily_send_limit: int
    whatsapp_messages_per_minute: int
    rsvp_messages_per_minute: int
    rsvp_max_reminders: int
    rsvp_reminder_cooldown_minutes: int
    failed_send_max_auto_retries: int
    failed_send_retry_delay_hours: tuple
    ecosystem_retry_delay_hours: tuple
    # field name -> 'organization' | 'platform', so the page can explain why a
    # number is what it is.
    sources: dict = field(default_factory=dict)

    def source_for(self, name: str) -> str:
        return self.sources.get(name, 'platform')

    @property
    def failed_send_retry_delays(self) -> tuple:
        return tuple(timedelta(hours=hours) for hours in self.failed_send_retry_delay_hours)

    @property
    def ecosystem_retry_delays(self) -> tuple:
        return tuple(timedelta(hours=hours) for hours in self.ecosystem_retry_delay_hours)


def _resolve(organization_id):
    from .models import OrganizationMessagingSettings

    defaults = platform_defaults()
    bounds = platform_bounds()
    row = None
    if organization_id is not None:
        row = OrganizationMessagingSettings.objects.filter(
            organization_id=organization_id,
        ).first()

    values = {}
    sources = {}
    for name, default in defaults.items():
        override = getattr(row, name, None) if row is not None else None
        if override is None:
            values[name] = default
            sources[name] = 'platform'
        else:
            values[name] = override
            sources[name] = 'organization'

    for name, (low, high) in bounds.items():
        values[name] = _clamp(int(values[name]), low, high)

    values['failed_send_retry_delay_hours'] = _clean_schedule(
        values['failed_send_retry_delay_hours'],
        defaults['failed_send_retry_delay_hours'],
    )
    values['ecosystem_retry_delay_hours'] = _clean_schedule(
        values['ecosystem_retry_delay_hours'],
        defaults['ecosystem_retry_delay_hours'],
    )

    return ResolvedMessagingSettings(
        organization_id=organization_id, sources=sources, **values,
    )


def messaging_settings_for(organization_id) -> ResolvedMessagingSettings:
    """Resolved settings for one organization, cached for this request/task.

    ``organization_id`` may be None (legacy call sites with no tenant), in
    which case the platform defaults are returned.
    """
    cache = getattr(_state, 'cache', None)
    if cache is None:
        cache = _state.cache = {}
    key = organization_id
    if key not in cache:
        cache[key] = _resolve(organization_id)
    return cache[key]


def clear_cache(organization_id=None):
    """Drop cached resolutions. Call after writing an override."""
    cache = getattr(_state, 'cache', None)
    if cache is None:
        return
    if organization_id is None:
        cache.clear()
    else:
        cache.pop(organization_id, None)
