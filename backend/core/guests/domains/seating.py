"""Seating domain — the public surface other code may call.

Seating owns SeatingSection and SeatingTable. It does **not** own guests, so
everything it needs to know about a guest comes through the events domain via
``guests.domains.events``.

The one write seating makes outside its own tables is a guest's table
assignment. That goes through :func:`assign_guest_to_table` rather than a
direct ``Guest.objects.update()``, so when seating becomes its own service the
call becomes an HTTP PATCH and no caller changes.
"""

import re

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


class SeatingCapacityError(ValueError):
    """A seating assignment would exceed the table's numbered seats."""


def _derived_prefix(name: str) -> str:
    parts = [part for part in re.split(r'[^A-Za-z0-9]+', name) if len(part) > 1]
    if len(parts) >= 2:
        return ''.join(part[0] for part in parts[:3]).upper()
    return (parts[0][:3] if parts else 'S').upper()


def create_initial_seating_setup(event, areas: list[dict]) -> list[SeatingSection]:
    """Create the optional table areas supplied by the event wizard."""
    created = []
    used_prefixes: set[str] = set()
    for position, area in enumerate(areas):
        base = (area.get('prefix') or _derived_prefix(area['name']))[:8].upper()
        prefix = base
        suffix = 2
        while prefix in used_prefixes:
            prefix = f'{base[:6]}{suffix}'
            suffix += 1
        used_prefixes.add(prefix)

        table_count = area['table_count']
        columns = min(3, table_count)
        section = SeatingSection.objects.create(
            event=event,
            name=area['name'],
            prefix=prefix,
            columns=columns,
            is_reserved=area.get('is_reserved', False),
            position=position,
            x=60 + (position % 3) * 430,
            y=60 + (position // 3) * 380,
        )
        SeatingTable.objects.bulk_create([
            SeatingTable(
                section=section,
                event=event,
                label=f'{prefix}-{index + 1:02d}',
                shape=area.get('shape', SeatingTable.Shape.ROUND),
                seats=area['seats_per_table'],
                x=(index % columns) * 150,
                y=(index // columns) * 150,
                position=index,
            )
            for index in range(table_count)
        ])
        created.append(section)
    return created


def _seat_index(value: str, capacity: int) -> int | None:
    try:
        index = int(value)
    except (TypeError, ValueError):
        return None
    return index if 1 <= index <= capacity else None


def assign_guest_to_table(
    event_id: int,
    guest_ids,
    label: str,
    capacity: int,
) -> int:
    """Seat guests and give each one the first available seat number.

    Guests outside this event are ignored rather than raising, so a stale tab
    cannot seat somebody else's guest. The caller locks the SeatingTable row,
    serialising concurrent assignments to this table.
    """
    if not guest_ids:
        return 0

    capacity = max(1, int(capacity))
    requested = list(
        Guest.objects
        .select_for_update()
        .filter(event_id=event_id, id__in=guest_ids)
        .order_by('full_name', 'id')
    )
    requested_ids = {guest.id for guest in requested}
    occupied = set()
    for seat_number in (
        Guest.objects
        .select_for_update()
        .filter(event_id=event_id, table_number=label)
        .exclude(id__in=requested_ids)
        .values_list('seat_number', flat=True)
    ):
        if (index := _seat_index(seat_number, capacity)) is not None:
            occupied.add(index)

    changed = []
    for guest in requested:
        current = _seat_index(guest.seat_number, capacity) if guest.table_number == label else None
        if current is not None and current not in occupied:
            occupied.add(current)
            continue

        seat = next((number for number in range(1, capacity + 1) if number not in occupied), None)
        if seat is None:
            raise SeatingCapacityError(f'{label} has no available seats.')
        occupied.add(seat)
        guest.table_number = label
        guest.seat_number = str(seat)
        changed.append(guest)

    if changed:
        Guest.objects.bulk_update(changed, ['table_number', 'seat_number'])
    return len(requested)


def assign_guest_to_section(event_id: int, guest_id, section_name: str) -> SeatingTable:
    """Put one guest at the first table with a numbered seat available."""
    tables = list(
        SeatingTable.objects
        .select_for_update()
        .filter(event_id=event_id, section__name__iexact=section_name)
        .order_by('section__position', 'position', 'id')
    )
    if not tables:
        raise SeatingCapacityError(f'No seating area named "{section_name}" was found.')
    for table in tables:
        try:
            assign_guest_to_table(event_id, [guest_id], table.label, table.seats)
            return table
        except SeatingCapacityError:
            continue
    raise SeatingCapacityError(f'{tables[0].section.name} has no available seats.')


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
