"""Seating domain — the public surface other code may call.

Seating owns SeatingSection and SeatingTable. It does **not** own guests, so
everything it needs to know about a guest comes through the events domain via
``guests.domains.events``.

The one write seating makes outside its own tables is a guest's table
assignment. That goes through :func:`assign_guest_to_table` rather than a
direct ``Guest.objects.update()``, so when seating becomes its own service the
call becomes an HTTP PATCH and no caller changes.
"""

from django.db.models import Count

from ..models import Guest, SeatingSection, SeatingTable


def seat_counts_for_event(event_id: int) -> dict[str, int]:
    """How many guests are seated at each table label, for one event.

    Returned keyed by label rather than table id because a guest records a
    free-text ``table_number``, not a foreign key — renaming a table does not
    silently move the people sitting at it.
    """
    return dict(
        Guest.objects
        .filter(event_id=event_id)
        .exclude(table_number='')
        .values_list('table_number')
        .annotate(total=Count('id'))
    )


def guests_at_table(event_id: int, label: str):
    """Guests sitting at one table, ordered for display."""
    return (
        Guest.objects
        .filter(event_id=event_id, table_number=label)
        .order_by('full_name')
        .values('id', 'full_name', 'seat_number', 'status')
    )


def unseated_guests(event_id: int, limit: int = 200):
    """Guests on this event with no table yet."""
    return (
        Guest.objects
        .filter(event_id=event_id, table_number='')
        .order_by('full_name')
        .values('id', 'full_name', 'status')[:limit]
    )


def assign_guest_to_table(event_id: int, guest_ids, label: str) -> int:
    """Seat guests at a table. Returns how many were moved.

    Guests outside this event are ignored rather than raising, so a stale tab
    cannot seat somebody else's guest.
    """
    if not guest_ids:
        return 0
    return (
        Guest.objects
        .filter(event_id=event_id, id__in=guest_ids)
        .update(table_number=label)
    )


def clear_guests_from_table(event_id: int, guest_ids, label: str) -> int:
    """Unseat guests from a table. Returns how many were cleared.

    Scoped to the given label so a guest who has already been moved elsewhere
    is not cleared by a stale request.
    """
    if not guest_ids:
        return 0
    return (
        Guest.objects
        .filter(event_id=event_id, id__in=guest_ids, table_number=label)
        .update(table_number='', seat_number='')
    )


def plan_for_event(event_id: int):
    """Every section on an event's plan, with its tables preloaded."""
    return (
        SeatingSection.objects
        .filter(event_id=event_id)
        .prefetch_related('tables')
        .order_by('position', 'id')
    )


def tables_for_event(event_id: int):
    """Every table on an event's plan."""
    return SeatingTable.objects.filter(event_id=event_id).order_by('position', 'id')
