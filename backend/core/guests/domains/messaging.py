"""Messaging domain — the public surface other code may call.

Messaging owns WhatsApp templates, reminders and the delivery record on each
guest. It is the only domain that may spend the daily send budget.

The budget is the reason this domain cannot be extracted before the others:
``remaining_send_budget()`` counts sends across three tables in two apps in a
single query, to stay inside Meta's rolling 24-hour cap. Splitting those tables
across databases breaks that query, so the counter has to be consolidated into
one owned ledger first. Routing every budget read through this module is the
first step — when the ledger arrives, only this file changes.
"""

from ..models import EventReminder, ReminderLog, TemplateCategory, WhatsAppTemplate
from ..send_budget import daily_send_limit, remaining_send_budget


def sends_remaining_today() -> int:
    """Business-initiated WhatsApp sends still allowed in the rolling window.

    Every dispatcher must check this before queueing, so a large event drains
    at the tier limit across several days rather than hitting Meta's wall
    mid-send and stranding half the list in a failed state.
    """
    return remaining_send_budget()


def daily_limit() -> int:
    """The configured cap for the rolling 24-hour window."""
    return daily_send_limit()


def can_send(count: int = 1) -> bool:
    """Whether there is budget for this many more sends."""
    return remaining_send_budget() >= count


def templates_for_organization(organization):
    """Approved WhatsApp templates an organisation may send."""
    return (
        WhatsAppTemplate.objects
        .filter(organization=organization, is_active=True)
        .order_by('category__name', 'display_name', 'name')
    )


def template_categories(organization):
    """Template groupings for one organisation."""
    return TemplateCategory.objects.filter(organization=organization).order_by('name')


def reminders_for_event(event_id: int):
    """Scheduled reminders configured on an event."""
    return EventReminder.objects.filter(event_id=event_id).order_by('id')


def delivery_log_for_guest(guest_id):
    """Every reminder send attempted for one guest, newest first."""
    return ReminderLog.objects.filter(guest_id=guest_id).order_by('-sent_at')
