"""Preferences domain — what each guest asked for, and what that totals to.

Answers live in GuestRequirementResponse with typed columns, so totals stay
database work: SUM(value_int) for fabric yardage, GROUP BY value_text for meal
choices. Nothing here loads every row to count it in Python.

Two shapes come out of here, because planners need both:

  * a **roster** — one row per guest with every answer, for reading a specific
    person's requirements at a glance;
  * **totals** — per-question counts, which is what gets handed to a caterer
    or a fabric vendor.

Aso Ebi and plus-one predate the requirement builder and live in columns on
Guest, so they are folded in here rather than left for the caller to merge.
"""

from django.db.models import Count, Q, Sum

from ..models import (
    Guest,
    GuestRequirement,
    GuestRequirementResponse,
    SeatingTable,
)


def _requirements(event_id: int):
    return (
        GuestRequirement.objects
        .filter(event_id=event_id, is_active=True)
        .order_by('position', 'id')
    )


def _collated_options(options: list, counts: dict[str, int]) -> list[dict]:
    """Return every configured option with its count, including zeroes.

    Old response data can occasionally contain a value that is no longer in
    the question's option list. Keep those values at the end rather than
    silently dropping them from a supplier total.
    """
    configured = []
    configured_keys = set()
    for option in options or []:
        label = str(option).strip()
        key = label.casefold()
        if label and key not in configured_keys:
            configured.append(label)
            configured_keys.add(key)

    normalised_counts: dict[str, dict] = {}
    for label, count in counts.items():
        clean_label = str(label).strip()
        if not clean_label:
            continue
        key = clean_label.casefold()
        if key not in normalised_counts:
            normalised_counts[key] = {'label': clean_label, 'count': 0}
        normalised_counts[key]['count'] += count

    breakdown = []
    for label in configured:
        row = normalised_counts.pop(label.casefold(), None)
        breakdown.append({'label': label, 'count': row['count'] if row else 0})

    breakdown.extend(sorted(
        normalised_counts.values(),
        key=lambda row: (-row['count'], row['label']),
    ))
    return breakdown


def question_totals(event_id: int) -> list[dict]:
    """Per-question totals, in the shape a vendor order needs.

    Choice questions come back as a breakdown by option; quantity questions as
    a sum and a count of who asked; booleans as yes/no.
    """
    totals = []
    for requirement in _requirements(event_id):
        responses = GuestRequirementResponse.objects.filter(requirement=requirement)
        entry = {
            'id': requirement.id,
            'key': requirement.key,
            'label': requirement.label,
            'kind': requirement.kind,
            'unit': requirement.unit_term if requirement.kind == GuestRequirement.Kind.QUANTITY else '',
            'answered': 0,
            # For a multi-select question this can be greater than `answered`:
            # one guest may contribute several supplier-relevant selections.
            'selection_count': 0,
            'breakdown': [],
            'total': None,
        }

        if requirement.kind == GuestRequirement.Kind.CHOICE:
            rows = (
                responses.exclude(value_text='')
                .values('value_text')
                .annotate(count=Count('id'))
                .order_by('-count', 'value_text')
            )
            counts = {row['value_text']: row['count'] for row in rows}
            entry['breakdown'] = _collated_options(requirement.options, counts)
            entry['answered'] = sum(counts.values())
            entry['selection_count'] = entry['answered']

        elif requirement.kind == GuestRequirement.Kind.MULTI_CHOICE:
            # JSON lists cannot be grouped in the database portably, so this is
            # the one question type counted in Python. Bounded by option count,
            # not by guest count.
            tally: dict[str, int] = {}
            for values in responses.values_list('value_json', flat=True):
                for value in values or []:
                    tally[value] = tally.get(value, 0) + 1
            entry['breakdown'] = _collated_options(requirement.options, tally)
            entry['answered'] = responses.exclude(value_json=[]).count()
            entry['selection_count'] = sum(tally.values())

        elif requirement.kind == GuestRequirement.Kind.BOOLEAN:
            yes = responses.filter(value_bool=True).count()
            no = responses.filter(value_bool=False).count()
            entry['breakdown'] = [
                {'label': 'Yes', 'count': yes},
                {'label': 'No', 'count': no},
            ]
            entry['answered'] = yes + no
            entry['selection_count'] = entry['answered']

        elif requirement.kind == GuestRequirement.Kind.QUANTITY:
            answered = responses.filter(value_int__gt=0)
            entry['total'] = answered.aggregate(total=Sum('value_int'))['total'] or 0
            entry['answered'] = answered.count()
            entry['selection_count'] = entry['answered']

        else:  # TEXT — free-form, so there is nothing to total.
            entry['answered'] = responses.exclude(value_text='').count()
            entry['selection_count'] = entry['answered']

        totals.append(entry)
    return totals


def _table_question_totals(requirements: list, responses: list) -> list[dict]:
    """Collate one table's answers without issuing queries per table."""
    by_requirement: dict[int, list] = {}
    for response in responses:
        by_requirement.setdefault(response.requirement_id, []).append(response)

    totals = []
    for requirement in requirements:
        rows = by_requirement.get(requirement.id, [])
        entry = {
            'id': requirement.id,
            'key': requirement.key,
            'label': requirement.label,
            'kind': requirement.kind,
            'unit': requirement.unit_term if requirement.kind == GuestRequirement.Kind.QUANTITY else '',
            'answered': 0,
            'selection_count': 0,
            'breakdown': [],
            'total': None,
        }

        if requirement.kind == GuestRequirement.Kind.CHOICE:
            tally: dict[str, int] = {}
            for response in rows:
                if response.value_text:
                    tally[response.value_text] = tally.get(response.value_text, 0) + 1
            entry['breakdown'] = [
                row for row in _collated_options(requirement.options, tally)
                if row['count'] > 0
            ]
            entry['answered'] = sum(tally.values())
            entry['selection_count'] = entry['answered']

        elif requirement.kind == GuestRequirement.Kind.MULTI_CHOICE:
            tally = {}
            for response in rows:
                for value in response.value_json or []:
                    tally[value] = tally.get(value, 0) + 1
            entry['breakdown'] = [
                row for row in _collated_options(requirement.options, tally)
                if row['count'] > 0
            ]
            entry['answered'] = sum(bool(response.value_json) for response in rows)
            entry['selection_count'] = sum(tally.values())

        elif requirement.kind == GuestRequirement.Kind.BOOLEAN:
            yes = sum(response.value_bool is True for response in rows)
            no = sum(response.value_bool is False for response in rows)
            entry['breakdown'] = [
                {'label': label, 'count': count}
                for label, count in (('Yes', yes), ('No', no)) if count > 0
            ]
            entry['answered'] = yes + no
            entry['selection_count'] = entry['answered']

        elif requirement.kind == GuestRequirement.Kind.QUANTITY:
            quantities = [response.value_int for response in rows if response.value_int]
            entry['total'] = sum(quantities)
            entry['answered'] = len(quantities)
            entry['selection_count'] = entry['answered']

        else:
            entry['answered'] = sum(bool(response.value_text) for response in rows)
            entry['selection_count'] = entry['answered']

        if entry['answered']:
            totals.append(entry)
    return totals


def seating_service_plan(event_id: int) -> list[dict]:
    """Preference totals grouped into printable table service cards.

    Configured seating tables are matched to ``Guest.table_number`` by label.
    Free-text table labels that do not exist on the plan are retained, and
    guests without a table are placed in a final attention bucket.
    """
    requirements = list(_requirements(event_id))
    tables = list(
        SeatingTable.objects
        .filter(event_id=event_id)
        .select_related('section')
        .order_by('section__position', 'section_id', 'position', 'id')
    )
    guests = list(
        Guest.objects.filter(event_id=event_id)
        .order_by('table_number', 'seat_number', 'full_name')
    )
    responses = list(
        GuestRequirementResponse.objects
        .filter(requirement__in=requirements, guest__event_id=event_id)
        .select_related('requirement')
        .order_by('requirement__position', 'requirement_id')
    )

    answers_by_guest: dict = {}
    response_rows_by_guest: dict = {}
    for response in responses:
        response_rows_by_guest.setdefault(response.guest_id, []).append(response)
        if response.has_answer:
            answers_by_guest.setdefault(response.guest_id, []).append({
                'requirement_id': response.requirement_id,
                'label': response.requirement.label,
                'kind': response.requirement.kind,
                'value': response.display_value,
            })

    buckets: list[dict] = []
    bucket_by_label: dict[str, dict] = {}
    for table in tables:
        bucket = {
            'section_id': table.section_id,
            'section_name': table.section.name,
            'table_id': table.id,
            'table_label': table.label,
            'seats': table.seats,
            'unassigned': False,
            '_guests': [],
        }
        buckets.append(bucket)
        bucket_by_label[table.label.strip().casefold()] = bucket

    unmatched: dict[str, dict] = {}
    unassigned = {
        'section_id': None,
        'section_name': 'Needs seating',
        'table_id': None,
        'table_label': 'Unassigned guests',
        'seats': 0,
        'unassigned': True,
        '_guests': [],
    }
    for guest in guests:
        table_label = guest.table_number.strip()
        if not table_label:
            unassigned['_guests'].append(guest)
            continue
        bucket = bucket_by_label.get(table_label.casefold())
        if bucket is None:
            key = table_label.casefold()
            bucket = unmatched.setdefault(key, {
                'section_id': None,
                'section_name': 'Other tables',
                'table_id': None,
                'table_label': table_label,
                'seats': 0,
                'unassigned': False,
                '_guests': [],
            })
        bucket['_guests'].append(guest)

    occupied = [bucket for bucket in buckets if bucket['_guests']]
    occupied.extend(sorted(unmatched.values(), key=lambda row: row['table_label'].casefold()))
    if unassigned['_guests']:
        occupied.append(unassigned)

    service_plan = []
    for bucket in occupied:
        table_guests = bucket.pop('_guests')
        table_guests.sort(key=lambda guest: (
            0 if guest.seat_number.strip().isdigit() else 1,
            int(guest.seat_number.strip()) if guest.seat_number.strip().isdigit() else 0,
            guest.seat_number.strip().casefold(),
            guest.full_name.casefold(),
        ))
        table_guest_ids = {guest.id for guest in table_guests}
        table_responses = [
            response for guest_id in table_guest_ids
            for response in response_rows_by_guest.get(guest_id, [])
        ]
        service_plan.append({
            **bucket,
            'guest_count': len(table_guests),
            'checked_in_count': sum(
                guest.status == Guest.Status.CHECKED_IN for guest in table_guests
            ),
            'responded_count': sum(
                guest.preferences_submitted_at is not None for guest in table_guests
            ),
            'totals': _table_question_totals(requirements, table_responses),
            'guests': [
                {
                    'id': str(guest.id),
                    'full_name': guest.full_name,
                    'seat_number': guest.seat_number,
                    'checked_in': guest.status == Guest.Status.CHECKED_IN,
                    'submitted': guest.preferences_submitted_at is not None,
                    'answers': answers_by_guest.get(guest.id, []),
                }
                for guest in table_guests
            ],
        })
    return service_plan


def has_aso_ebi_requirement(event_id: int) -> bool:
    """Whether this event asks for Aso Ebi as a configured question.

    Aso Ebi exists twice in the data model: as columns on Guest that predate
    the requirement builder, and as a quantity requirement once a planner
    configures one. Showing both would put two different totals for the same
    fabric on the same page, so the caller uses this to pick one.
    """
    return GuestRequirement.objects.filter(
        event_id=event_id, is_active=True,
        kind=GuestRequirement.Kind.QUANTITY, key__icontains='aso_ebi',
    ).exists()


def legacy_totals(event_id: int) -> dict:
    """Aso Ebi and plus-one totals from the columns on Guest.

    ``aso_ebi_superseded`` tells the page a configured question owns that
    number instead, so it is not shown twice.
    """
    guests = Guest.objects.filter(event_id=event_id)
    aso_ebi = guests.filter(aso_ebi_requested=True)
    return {
        'aso_ebi_guests': aso_ebi.count(),
        'aso_ebi_quantity': aso_ebi.aggregate(total=Sum('aso_ebi_quantity'))['total'] or 0,
        'aso_ebi_superseded': has_aso_ebi_requirement(event_id),
        'plus_ones': guests.filter(plus_one_attending=True).count(),
    }


def response_summary(event_id: int) -> dict:
    """Headline numbers: who has responded and who is still outstanding."""
    guests = Guest.objects.filter(event_id=event_id)
    return guests.aggregate(
        total=Count('id'),
        submitted=Count('id', filter=Q(preferences_submitted_at__isnull=False)),
        outstanding=Count('id', filter=Q(preferences_submitted_at__isnull=True)),
    )


def guest_roster(event_id: int, *, search: str = '', answered: str = '') -> list[dict]:
    """One row per guest with every answer, ready for the detail table.

    ``answered`` filters to 'yes' (submitted preferences) or 'no' (outstanding);
    anything else returns everyone.

    Answers are fetched in one query and grouped in memory rather than one
    query per guest, so this stays flat as a list grows.
    """
    guests = Guest.objects.filter(event_id=event_id)
    if search:
        guests = guests.filter(full_name__icontains=search)
    if answered == 'yes':
        guests = guests.filter(preferences_submitted_at__isnull=False)
    elif answered == 'no':
        guests = guests.filter(preferences_submitted_at__isnull=True)
    guests = guests.order_by('full_name')

    # Evaluate once and reuse: asking for ids and then for the rows would
    # query the guest table twice for no benefit.
    guest_rows = list(guests)
    by_guest: dict = {}
    responses = (
        GuestRequirementResponse.objects
        .filter(guest_id__in=[guest.id for guest in guest_rows])
        .select_related('requirement')
        .order_by('requirement__position', 'requirement_id')
    )
    for response in responses:
        by_guest.setdefault(response.guest_id, []).append({
            'requirement_id': response.requirement_id,
            'key': response.requirement.key,
            'label': response.requirement.label,
            'kind': response.requirement.kind,
            'value': response.display_value,
            'answered': response.has_answer,
        })

    roster = []
    for guest in guest_rows:
        roster.append({
            'id': str(guest.id),
            'full_name': guest.full_name,
            'phone_number': guest.phone_number,
            'ticket_type': guest.ticket_type,
            'table_number': guest.table_number,
            'status': guest.status,
            'submitted_at': guest.preferences_submitted_at,
            'aso_ebi_requested': guest.aso_ebi_requested,
            'aso_ebi_quantity': guest.aso_ebi_quantity,
            'plus_one_attending': guest.plus_one_attending,
            'answers': by_guest.get(guest.id, []),
        })
    return roster


def requirement_columns(event_id: int) -> list[dict]:
    """The questions this event asks, as table columns for the roster."""
    return [
        {
            'id': requirement.id,
            'key': requirement.key,
            'label': requirement.label,
            'kind': requirement.kind,
            'unit': requirement.unit_term if requirement.kind == GuestRequirement.Kind.QUANTITY else '',
        }
        for requirement in _requirements(event_id)
    ]
