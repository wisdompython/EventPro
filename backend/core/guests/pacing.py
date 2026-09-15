"""Per-organization send pacing, applied inside the send tasks.

Celery's ``@shared_task(rate_limit=...)`` is bound when the worker imports the
module, so it cannot carry a per-organization value and cannot be changed
without a worker restart. It stays as a global ceiling.

This module supplies the per-organization half: before a send task hands a
message to Meta it waits until at least ``60 / messages_per_minute`` seconds
have passed since that organization's previous send on this worker. The result
is a throttle that can only ever be *slower* than the decorator's ceiling, so
an organization can pace itself down (a new number warming up, a poor quality
rating) without a restart, and a raised per-org value is still capped by the
worker ceiling.

The spacing is tracked per worker process, matching how Celery applies
``rate_limit`` itself. Across N workers the effective pace is N times the
configured value, exactly as the decorator's own limit behaves — the delivery
monitor reports that product.
"""
import logging
import time
from threading import Lock

from accounts.messaging_settings import messaging_settings_for

logger = logging.getLogger(__name__)

# organization_id -> monotonic timestamp of that org's last send on this worker.
_last_send_at: dict = {}
_lock = Lock()

# A misconfigured value should slow sends, not hang a worker for minutes.
MAX_SPACING_SECONDS = 30.0


def _spacing_seconds(messages_per_minute: int) -> float:
    if messages_per_minute <= 0:
        return MAX_SPACING_SECONDS
    return min(60.0 / messages_per_minute, MAX_SPACING_SECONDS)


def pace_send(organization_id, *, channel: str, sleep=time.sleep) -> float:
    """Block until this organization's next send is due. Returns seconds waited.

    ``channel`` is 'whatsapp' (guest passes) or 'rsvp' (invitations and
    reminders), which select the matching per-organization pace.
    """
    resolved = messaging_settings_for(organization_id)
    per_minute = (
        resolved.rsvp_messages_per_minute if channel == 'rsvp'
        else resolved.whatsapp_messages_per_minute
    )
    spacing = _spacing_seconds(per_minute)

    with _lock:
        now = time.monotonic()
        key = (organization_id, channel)
        due_at = _last_send_at.get(key, 0.0) + spacing
        wait = max(due_at - now, 0.0)
        # Reserve this slot before releasing the lock so two concurrent task
        # threads in the same worker do not both claim the same moment.
        _last_send_at[key] = now + wait

    if wait > 0:
        sleep(wait)
    return wait


def reset():
    """Clear recorded pacing state. For tests."""
    with _lock:
        _last_send_at.clear()
