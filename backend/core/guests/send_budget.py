"""Per-organization daily WhatsApp send budget.

Meta caps the number of unique users a WhatsApp Business number may open
business-initiated conversations with per rolling 24 hours (the messaging
tier). Every dispatcher checks the remaining budget before queueing template
sends, so a 5,000-guest event drains at the tier limit across several days
instead of hitting Meta's wall mid-send and stranding half the list in a
failed state.

The budget is scoped to one organization. Each tenant has its own WhatsApp
Business account and therefore its own tier: counting one tenant's sends
against another's limit would let a busy workspace starve a quiet one. None
of Guest/RsvpRecipient/ReminderLog carries an organization column, so the
scope is applied by traversing the event that owns each row.
"""
from datetime import timedelta

from django.utils import timezone

from accounts.messaging_settings import messaging_settings_for

# Sends are measured over Meta's rolling 24h window.
SEND_WINDOW = timedelta(hours=24)

# A dispatched-but-unsent RSVP message older than this is treated as lost
# (worker died, retries exhausted) — it stops counting as in-flight and the
# Beat sweep re-dispatches it. Must comfortably exceed the worst-case queue
# drain time (a full day's budget at the task rate limit) plus retry delays.
DISPATCHED_STALE_AFTER = timedelta(hours=6)

# How long a claimed-but-unsent scheduled/direct pass counts as in flight
# before the claim is considered stale and the guest is re-claimed.
SCHEDULED_SEND_CLAIM_TIMEOUT = timedelta(hours=1)

# A reminder claimed this recently counts as in flight and is not re-queued.
REMINDER_CLAIM_TIMEOUT = timedelta(hours=1)


def daily_send_limit(organization_id=None) -> int:
    """This organization's Meta messaging tier."""
    return messaging_settings_for(organization_id).daily_send_limit


def _scope(queryset, organization_id, path):
    """Restrict a queryset to one organization via its owning event."""
    if organization_id is None:
        return queryset
    return queryset.filter(**{path: organization_id})


def remaining_send_budget(now=None, organization_id=None) -> int:
    """Business-initiated sends still allowed for one organization.

    Counts messages already sent in the trailing 24h window plus messages
    dispatched to the broker but not yet sent (those will consume budget
    shortly). The count is deliberately conservative: a pass delivered inside
    a guest's 24h reply window does not consume Meta's limit, but it is still
    counted here — under-spending is safe, overshooting strands sends in a
    failed state.

    ``organization_id=None`` counts across every tenant, which is only
    correct for a platform-wide view. Dispatchers always pass a tenant.
    """
    from rsvp.models import RsvpRecipient

    from .models import Guest, ReminderLog

    now = now or timezone.now()
    window_start = now - SEND_WINDOW
    fresh_after = now - DISPATCHED_STALE_AFTER

    recipients = _scope(
        RsvpRecipient.objects.all(), organization_id, 'workflow__event__organization_id',
    )
    guests = _scope(Guest.objects.all(), organization_id, 'event__organization_id')
    reminder_logs = _scope(
        ReminderLog.objects.all(), organization_id, 'reminder__event__organization_id',
    )

    sent = (
        recipients.filter(invitation_sent_at__gte=window_start).count()
        + guests.filter(whatsapp_sent_at__gte=window_start).count()
        + reminder_logs.filter(success=True, sent_at__gte=window_start).count()
    )

    in_flight = (
        recipients.filter(
            invitation_status__in=[
                RsvpRecipient.InvitationStatus.QUEUED,
                RsvpRecipient.InvitationStatus.SENDING,
            ],
            invitation_queued_at__gte=fresh_after,
        ).count()
        + recipients.filter(
            pass_status__in=[
                RsvpRecipient.PassStatus.QUEUED,
                RsvpRecipient.PassStatus.SENDING,
            ],
            pass_queued_at__gte=fresh_after,
        ).count()
        + guests.filter(
            whatsapp_sent=False,
            scheduled_send_claimed_at__gte=now - SCHEDULED_SEND_CLAIM_TIMEOUT,
        ).count()
        + reminder_logs.filter(
            success=False,
            queued_at__gte=now - REMINDER_CLAIM_TIMEOUT,
        ).count()
    )

    return max(daily_send_limit(organization_id) - sent - in_flight, 0)
