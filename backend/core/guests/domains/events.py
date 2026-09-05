"""Events domain — the public surface other code may call.

Events owns Event, Guest, GuestRequirement and the bulk upload pipeline: it is
the system of record for who is invited to what. Seating and messaging both
read from here and neither writes a guest directly.

Every function takes an ``organization`` where tenancy applies, so a caller
cannot accidentally read across organisations by forgetting to filter.
"""

from ..models import Event, Guest


def get_event(event_id: int, organization=None):
    """One event, scoped to an organisation when given.

    Returns ``None`` rather than raising, so a caller that is checking
    existence does not need a try/except.
    """
    query = Event.objects.filter(pk=event_id)
    if organization is not None:
        query = query.filter(organization=organization)
    return query.first()


def event_exists(event_id: int, organization) -> bool:
    """Whether this organisation has an event with this id."""
    return Event.objects.filter(pk=event_id, organization=organization).exists()


def events_for_organization(organization):
    """Every event an organisation owns, newest first."""
    return Event.objects.filter(organization=organization).order_by('-date')


def get_guest(guest_id, event_id: int = None):
    """One guest, optionally constrained to an event."""
    query = Guest.objects.filter(pk=guest_id)
    if event_id is not None:
        query = query.filter(event_id=event_id)
    return query.first()


def guests_for_event(event_id: int):
    """Every guest on an event."""
    return Guest.objects.filter(event_id=event_id)


def guest_count(event_id: int) -> int:
    """How many guests are on an event."""
    return Guest.objects.filter(event_id=event_id).count()


def checked_in_count(event_id: int) -> int:
    """How many guests have been admitted."""
    return Guest.objects.filter(
        event_id=event_id, status=Guest.Status.CHECKED_IN,
    ).count()
