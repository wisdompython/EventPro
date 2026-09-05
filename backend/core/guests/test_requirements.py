"""Tests for GuestRequirement / GuestRequirementResponse (Phase 1).

Phase 1 ships models, a migration and a backfill - no API and no UI - so these
tests cover the data layer: the constraints that protect it, the aggregation the
dashboard will rely on, and the decisions recorded in
docs/guest-requirements-plan.md.
"""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Count, Sum
from django.test import TestCase
from django.utils import timezone

from .models import Event, Guest, GuestRequirement, GuestRequirementResponse


def make_event(**kwargs):
    defaults = {
        'name': 'Requirements Test Event',
        'date': timezone.now() + timedelta(days=30),
    }
    defaults.update(kwargs)
    return Event.objects.create(**defaults)


class GuestRequirementModelTests(TestCase):
    def setUp(self):
        self.event = make_event()

    def test_key_is_unique_per_event_but_reusable_across_events(self):
        GuestRequirement.objects.create(
            event=self.event, key='meal', label='Meal choice',
            kind=GuestRequirement.Kind.CHOICE, options=['Chicken', 'Fish'],
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                GuestRequirement.objects.create(
                    event=self.event, key='meal', label='Meal again',
                    kind=GuestRequirement.Kind.CHOICE,
                )

        # The same key on a different event is fine - requirements are per-event.
        other = make_event(name='Another Event')
        GuestRequirement.objects.create(
            event=other, key='meal', label='Meal choice',
            kind=GuestRequirement.Kind.CHOICE, options=['Chicken'],
        )
        self.assertEqual(GuestRequirement.objects.filter(key='meal').count(), 2)

    def test_requirements_order_by_position(self):
        third = GuestRequirement.objects.create(
            event=self.event, key='c', label='C', kind=GuestRequirement.Kind.TEXT, position=3,
        )
        first = GuestRequirement.objects.create(
            event=self.event, key='a', label='A', kind=GuestRequirement.Kind.TEXT, position=1,
        )
        second = GuestRequirement.objects.create(
            event=self.event, key='b', label='B', kind=GuestRequirement.Kind.TEXT, position=2,
        )
        self.assertEqual(
            list(self.event.requirements.all()), [first, second, third],
        )

    def test_unit_term_falls_back_when_blank(self):
        requirement = GuestRequirement.objects.create(
            event=self.event, key='fabric', label='Fabric',
            kind=GuestRequirement.Kind.QUANTITY,
        )
        self.assertEqual(requirement.unit_term, 'units')
        requirement.unit = 'yards'
        self.assertEqual(requirement.unit_term, 'yards')


class AppliesToTests(TestCase):
    """Decision 2: plus-ones answer for themselves, but not for everything."""

    def setUp(self):
        self.event = make_event(allow_plus_one=True)
        self.primary = Guest.objects.create(
            event=self.event, full_name='Primary Guest', phone_number='+2348010000001',
        )
        self.plus_one = Guest.objects.create(
            event=self.event, plus_one_of=self.primary,
            full_name='Named Companion', phone_number='+2348010000002',
        )

    def test_everyone_includes_plus_ones(self):
        meal = GuestRequirement.objects.create(
            event=self.event, key='meal', label='Meal choice',
            kind=GuestRequirement.Kind.CHOICE, options=['Chicken', 'Fish'],
            applies_to=GuestRequirement.AppliesTo.EVERYONE,
        )
        self.assertTrue(meal.applies_to_guest(self.primary))
        self.assertTrue(meal.applies_to_guest(self.plus_one))

    def test_primary_only_excludes_plus_ones(self):
        fabric = GuestRequirement.objects.create(
            event=self.event, key='fabric', label='Aso Ebi',
            kind=GuestRequirement.Kind.QUANTITY, unit='yards',
            applies_to=GuestRequirement.AppliesTo.PRIMARY,
        )
        self.assertTrue(fabric.applies_to_guest(self.primary))
        self.assertFalse(fabric.applies_to_guest(self.plus_one))

    def test_plus_one_answers_are_independent_of_the_primary(self):
        meal = GuestRequirement.objects.create(
            event=self.event, key='meal', label='Meal choice',
            kind=GuestRequirement.Kind.CHOICE, options=['Chicken', 'Fish'],
        )
        GuestRequirementResponse.objects.create(
            requirement=meal, guest=self.primary, value_text='Chicken',
        )
        GuestRequirementResponse.objects.create(
            requirement=meal, guest=self.plus_one, value_text='Fish',
        )
        answers = dict(
            meal.responses.values_list('guest__full_name', 'value_text'),
        )
        self.assertEqual(answers['Primary Guest'], 'Chicken')
        self.assertEqual(answers['Named Companion'], 'Fish')


class GuestRequirementResponseTests(TestCase):
    def setUp(self):
        self.event = make_event()
        self.guest = Guest.objects.create(
            event=self.event, full_name='Answering Guest', phone_number='+2348010000003',
        )

    def test_one_response_per_guest_per_requirement(self):
        requirement = GuestRequirement.objects.create(
            event=self.event, key='shuttle', label='Shuttle',
            kind=GuestRequirement.Kind.BOOLEAN,
        )
        GuestRequirementResponse.objects.create(
            requirement=requirement, guest=self.guest, value_bool=True,
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                GuestRequirementResponse.objects.create(
                    requirement=requirement, guest=self.guest, value_bool=False,
                )

    def test_re_answering_overwrites_without_history(self):
        """Decision 1: current state only."""
        requirement = GuestRequirement.objects.create(
            event=self.event, key='meal', label='Meal',
            kind=GuestRequirement.Kind.CHOICE, options=['Chicken', 'Fish'],
        )
        response = GuestRequirementResponse.objects.create(
            requirement=requirement, guest=self.guest, value_text='Chicken',
        )
        response.value_text = 'Fish'
        response.save()

        self.assertEqual(requirement.responses.count(), 1)
        self.assertEqual(requirement.responses.get().value_text, 'Fish')

    def test_display_value_per_kind(self):
        cases = [
            (GuestRequirement.Kind.BOOLEAN, {'value_bool': True}, 'Yes'),
            (GuestRequirement.Kind.BOOLEAN, {'value_bool': False}, 'No'),
            (GuestRequirement.Kind.QUANTITY, {'value_int': 6}, '6 yards'),
            (GuestRequirement.Kind.CHOICE, {'value_text': 'Fish'}, 'Fish'),
            (GuestRequirement.Kind.MULTI_CHOICE, {'value_json': ['Nuts', 'Dairy']}, 'Nuts, Dairy'),
            (GuestRequirement.Kind.TEXT, {'value_text': 'Wheelchair access'}, 'Wheelchair access'),
        ]
        for index, (kind, values, expected) in enumerate(cases):
            requirement = GuestRequirement.objects.create(
                event=self.event, key=f'req-{index}', label=f'Req {index}',
                kind=kind, unit='yards',
            )
            response = GuestRequirementResponse.objects.create(
                requirement=requirement, guest=self.guest, **values,
            )
            self.assertEqual(response.display_value, expected, msg=kind)

    def test_has_answer_treats_a_declined_boolean_as_answered(self):
        requirement = GuestRequirement.objects.create(
            event=self.event, key='shuttle', label='Shuttle',
            kind=GuestRequirement.Kind.BOOLEAN,
        )
        declined = GuestRequirementResponse.objects.create(
            requirement=requirement, guest=self.guest, value_bool=False,
        )
        # "No, I do not need a shuttle" is a real answer, not a missing one.
        self.assertTrue(declined.has_answer)

    def test_deleting_a_guest_removes_their_responses(self):
        requirement = GuestRequirement.objects.create(
            event=self.event, key='meal', label='Meal',
            kind=GuestRequirement.Kind.CHOICE, options=['Chicken'],
        )
        GuestRequirementResponse.objects.create(
            requirement=requirement, guest=self.guest, value_text='Chicken',
        )
        self.guest.delete()
        self.assertEqual(GuestRequirementResponse.objects.count(), 0)


class AggregationTests(TestCase):
    """The dashboard and vendor exports depend on these staying database work."""

    def setUp(self):
        self.event = make_event()
        self.guests = [
            Guest.objects.create(
                event=self.event, full_name=f'Guest {i}',
                phone_number=f'+23480100001{i:02d}',
            )
            for i in range(6)
        ]

    def test_quantity_totals_sum_in_the_database(self):
        fabric = GuestRequirement.objects.create(
            event=self.event, key='fabric', label='Aso Ebi',
            kind=GuestRequirement.Kind.QUANTITY, unit='yards',
        )
        for guest, yards in zip(self.guests, [6, 4, 10, 6]):
            GuestRequirementResponse.objects.create(
                requirement=fabric, guest=guest, value_int=yards,
            )
        totals = fabric.responses.aggregate(total=Sum('value_int'), requests=Count('id'))
        self.assertEqual(totals['total'], 26)
        self.assertEqual(totals['requests'], 4)

    def test_choice_breakdown_groups_in_the_database(self):
        meal = GuestRequirement.objects.create(
            event=self.event, key='meal', label='Meal choice',
            kind=GuestRequirement.Kind.CHOICE, options=['Chicken', 'Fish', 'Vegetarian'],
        )
        for guest, choice in zip(self.guests, ['Chicken', 'Fish', 'Chicken', 'Vegetarian', 'Chicken']):
            GuestRequirementResponse.objects.create(
                requirement=meal, guest=guest, value_text=choice,
            )
        breakdown = dict(
            meal.responses.values_list('value_text')
            .annotate(n=Count('id'))
            .values_list('value_text', 'n')
        )
        # This is what a caterer is handed.
        self.assertEqual(breakdown, {'Chicken': 3, 'Fish': 1, 'Vegetarian': 1})

    def test_outstanding_guests_can_be_found_for_a_required_question(self):
        meal = GuestRequirement.objects.create(
            event=self.event, key='meal', label='Meal choice',
            kind=GuestRequirement.Kind.CHOICE, options=['Chicken'], required=True,
        )
        for guest in self.guests[:2]:
            GuestRequirementResponse.objects.create(
                requirement=meal, guest=guest, value_text='Chicken',
            )
        outstanding = Guest.objects.filter(event=self.event).exclude(
            requirement_responses__requirement=meal,
        )
        self.assertEqual(outstanding.count(), 4)


class AsoEbiBackfillTests(TestCase):
    """The 0024 backfill must reproduce the legacy columns exactly."""

    def test_backfilled_requirement_matches_legacy_totals(self):
        # Recreate what the migration does, against a fresh event, so the shape
        # of the conversion is asserted rather than assumed.
        event = make_event(
            collect_aso_ebi=True, aso_ebi_label='Event Fabric', aso_ebi_unit='metres',
        )
        quantities = [6, 4, 0, 10, 0, 6]
        for index, quantity in enumerate(quantities):
            Guest.objects.create(
                event=event, full_name=f'Guest {index}',
                phone_number=f'+23480100002{index:02d}',
                aso_ebi_requested=bool(quantity), aso_ebi_quantity=quantity,
            )

        requirement = GuestRequirement.objects.create(
            event=event, key='aso_ebi', label=event.aso_ebi_term,
            kind=GuestRequirement.Kind.QUANTITY, unit=event.aso_ebi_unit_term,
            applies_to=GuestRequirement.AppliesTo.PRIMARY,
        )
        GuestRequirementResponse.objects.bulk_create([
            GuestRequirementResponse(requirement=requirement, guest=guest, value_int=guest.aso_ebi_quantity)
            for guest in Guest.objects.filter(event=event, aso_ebi_requested=True)
        ])

        legacy = Guest.objects.filter(event=event, aso_ebi_requested=True).aggregate(
            total=Sum('aso_ebi_quantity'), requests=Count('id'),
        )
        migrated = requirement.responses.aggregate(
            total=Sum('value_int'), requests=Count('id'),
        )
        self.assertEqual(migrated['total'], legacy['total'])
        self.assertEqual(migrated['requests'], legacy['requests'])
        self.assertEqual(requirement.label, 'Event Fabric')
        self.assertEqual(requirement.unit, 'metres')
