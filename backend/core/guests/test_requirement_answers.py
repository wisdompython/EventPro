"""Guest answers to configured requirements (Phase 3).

Covers validation per kind, the applies_to rule for companions, and the legacy
Aso Ebi dual-write that keeps the old columns usable until Phase 5.
"""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from .models import Event, Guest, GuestRequirement, GuestRequirementResponse
from .requirements import (
    RequirementError,
    describe_requirements,
    save_requirement_answers,
)


def make_event(**kwargs):
    defaults = {'name': 'Answers Event', 'date': timezone.now() + timedelta(days=21)}
    defaults.update(kwargs)
    return Event.objects.create(**defaults)


class AnswerValidationTests(TestCase):
    def setUp(self):
        self.event = make_event()
        self.guest = Guest.objects.create(
            event=self.event, full_name='Answering Guest', phone_number='+2348010000001',
        )

    def _requirement(self, **kwargs):
        defaults = {
            'event': self.event, 'key': 'q', 'label': 'Question',
            'kind': GuestRequirement.Kind.TEXT,
        }
        defaults.update(kwargs)
        return GuestRequirement.objects.create(**defaults)

    def test_quantity_accepts_a_positive_number(self):
        self._requirement(key='fabric', label='Fabric', kind=GuestRequirement.Kind.QUANTITY, unit='yards')
        save_requirement_answers(self.guest, {'fabric': 6}, collect_on='preferences')
        self.assertEqual(GuestRequirementResponse.objects.get().value_int, 6)

    def test_quantity_rejects_zero_and_text(self):
        self._requirement(key='fabric', label='Fabric', kind=GuestRequirement.Kind.QUANTITY, unit='yards')
        with self.assertRaises(RequirementError):
            save_requirement_answers(self.guest, {'fabric': 0}, collect_on='preferences')
        with self.assertRaises(RequirementError):
            save_requirement_answers(self.guest, {'fabric': 'six'}, collect_on='preferences')

    def test_choice_rejects_an_option_that_is_not_offered(self):
        self._requirement(
            key='meal', label='Meal', kind=GuestRequirement.Kind.CHOICE,
            options=['Chicken', 'Fish'],
        )
        with self.assertRaises(RequirementError):
            save_requirement_answers(self.guest, {'meal': 'Lobster'}, collect_on='preferences')

    def test_multi_choice_deduplicates_and_rejects_unknown_options(self):
        self._requirement(
            key='allergies', label='Allergies', kind=GuestRequirement.Kind.MULTI_CHOICE,
            options=['Nuts', 'Dairy', 'Gluten'],
        )
        save_requirement_answers(
            self.guest, {'allergies': ['Nuts', 'Dairy', 'Nuts']}, collect_on='preferences',
        )
        self.assertEqual(GuestRequirementResponse.objects.get().value_json, ['Nuts', 'Dairy'])

        with self.assertRaises(RequirementError):
            save_requirement_answers(
                self.guest, {'allergies': ['Shellfish']}, collect_on='preferences',
            )

    def test_boolean_requires_a_real_boolean(self):
        self._requirement(key='shuttle', label='Shuttle', kind=GuestRequirement.Kind.BOOLEAN)
        save_requirement_answers(self.guest, {'shuttle': False}, collect_on='preferences')
        self.assertIs(GuestRequirementResponse.objects.get().value_bool, False)

        with self.assertRaises(RequirementError):
            save_requirement_answers(self.guest, {'shuttle': 'yes'}, collect_on='preferences')

    def test_text_is_length_limited(self):
        self._requirement(key='note', label='Note', kind=GuestRequirement.Kind.TEXT)
        with self.assertRaises(RequirementError):
            save_requirement_answers(self.guest, {'note': 'x' * 256}, collect_on='preferences')

    def test_required_question_must_be_answered(self):
        self._requirement(
            key='meal', label='Meal', kind=GuestRequirement.Kind.CHOICE,
            options=['Chicken'], required=True,
        )
        with self.assertRaises(RequirementError):
            save_requirement_answers(self.guest, {}, collect_on='preferences')

    def test_required_question_stays_satisfied_by_a_previous_answer(self):
        self._requirement(
            key='meal', label='Meal', kind=GuestRequirement.Kind.CHOICE,
            options=['Chicken'], required=True,
        )
        save_requirement_answers(self.guest, {'meal': 'Chicken'}, collect_on='preferences')
        # A later submission that does not resend the answer must not fail.
        save_requirement_answers(self.guest, {}, collect_on='preferences')
        self.assertEqual(GuestRequirementResponse.objects.get().value_text, 'Chicken')

    def test_unknown_keys_are_ignored(self):
        self._requirement(key='meal', label='Meal', kind=GuestRequirement.Kind.CHOICE, options=['Chicken'])
        save_requirement_answers(
            self.guest, {'meal': 'Chicken', 'deleted_question': 'anything'},
            collect_on='preferences',
        )
        self.assertEqual(GuestRequirementResponse.objects.count(), 1)

    def test_omitted_keys_are_left_alone(self):
        self._requirement(key='a', label='A', kind=GuestRequirement.Kind.TEXT)
        self._requirement(key='b', label='B', kind=GuestRequirement.Kind.TEXT)
        save_requirement_answers(self.guest, {'a': 'first', 'b': 'second'}, collect_on='preferences')
        # A page that renders only one question must not wipe the other.
        save_requirement_answers(self.guest, {'a': 'updated'}, collect_on='preferences')
        answers = dict(
            GuestRequirementResponse.objects.values_list('requirement__key', 'value_text'),
        )
        self.assertEqual(answers, {'a': 'updated', 'b': 'second'})

    def test_clearing_an_answer_removes_the_response(self):
        self._requirement(key='note', label='Note', kind=GuestRequirement.Kind.TEXT)
        save_requirement_answers(self.guest, {'note': 'Wheelchair'}, collect_on='preferences')
        save_requirement_answers(self.guest, {'note': ''}, collect_on='preferences')
        self.assertEqual(GuestRequirementResponse.objects.count(), 0)


class CollectOnTests(TestCase):
    def setUp(self):
        self.event = make_event()
        self.guest = Guest.objects.create(
            event=self.event, full_name='Guest', phone_number='+2348010000010',
        )

    def test_a_preferences_only_question_is_not_asked_on_rsvp(self):
        GuestRequirement.objects.create(
            event=self.event, key='note', label='Note',
            kind=GuestRequirement.Kind.TEXT,
            collect_on=GuestRequirement.CollectOn.PREFERENCES,
        )
        self.assertEqual(describe_requirements(self.event, collect_on='rsvp'), [])
        self.assertEqual(len(describe_requirements(self.event, collect_on='preferences')), 1)

    def test_both_appears_on_either_surface(self):
        GuestRequirement.objects.create(
            event=self.event, key='meal', label='Meal',
            kind=GuestRequirement.Kind.CHOICE, options=['Chicken'],
            collect_on=GuestRequirement.CollectOn.BOTH,
        )
        self.assertEqual(len(describe_requirements(self.event, collect_on='rsvp')), 1)
        self.assertEqual(len(describe_requirements(self.event, collect_on='preferences')), 1)

    def test_inactive_questions_are_not_asked(self):
        GuestRequirement.objects.create(
            event=self.event, key='old', label='Old', kind=GuestRequirement.Kind.TEXT,
            is_active=False,
        )
        self.assertEqual(describe_requirements(self.event, collect_on='preferences'), [])

    def test_a_question_on_the_other_surface_cannot_be_written(self):
        GuestRequirement.objects.create(
            event=self.event, key='note', label='Note', kind=GuestRequirement.Kind.TEXT,
            collect_on=GuestRequirement.CollectOn.PREFERENCES,
        )
        save_requirement_answers(self.guest, {'note': 'sneaky'}, collect_on='rsvp')
        self.assertEqual(GuestRequirementResponse.objects.count(), 0)


class CompanionAnswerTests(TestCase):
    """Decision 2: companions answer for themselves, but not for everything."""

    def setUp(self):
        self.event = make_event(allow_plus_one=True)
        self.primary = Guest.objects.create(
            event=self.event, full_name='Primary', phone_number='+2348010000020',
        )
        self.companion = Guest.objects.create(
            event=self.event, plus_one_of=self.primary,
            full_name='Companion', phone_number='+2348010000021',
        )

    def test_companion_answers_an_everyone_question(self):
        GuestRequirement.objects.create(
            event=self.event, key='meal', label='Meal',
            kind=GuestRequirement.Kind.CHOICE, options=['Chicken', 'Fish'],
            applies_to=GuestRequirement.AppliesTo.EVERYONE,
        )
        save_requirement_answers(self.primary, {'meal': 'Chicken'}, collect_on='preferences')
        save_requirement_answers(self.companion, {'meal': 'Fish'}, collect_on='preferences')
        answers = dict(
            GuestRequirementResponse.objects.values_list('guest__full_name', 'value_text'),
        )
        self.assertEqual(answers, {'Primary': 'Chicken', 'Companion': 'Fish'})

    def test_companion_is_not_asked_a_primary_only_question(self):
        GuestRequirement.objects.create(
            event=self.event, key='fabric', label='Fabric',
            kind=GuestRequirement.Kind.QUANTITY, unit='yards',
            applies_to=GuestRequirement.AppliesTo.PRIMARY,
        )
        asked = describe_requirements(self.event, collect_on='preferences', guest=self.companion)
        self.assertEqual(asked, [])

        # And an answer sent anyway is ignored rather than stored.
        save_requirement_answers(self.companion, {'fabric': 5}, collect_on='preferences')
        self.assertEqual(GuestRequirementResponse.objects.count(), 0)


class LegacyAsoEbiSyncTests(TestCase):
    """The old columns must stay usable until Phase 5 retires them."""

    def setUp(self):
        self.event = make_event(collect_aso_ebi=True, aso_ebi_unit='yards')
        self.guest = Guest.objects.create(
            event=self.event, full_name='Fabric Guest', phone_number='+2348010000030',
        )
        self.requirement = GuestRequirement.objects.create(
            event=self.event, key='aso_ebi', label='Aso Ebi',
            kind=GuestRequirement.Kind.QUANTITY, unit='yards',
            applies_to=GuestRequirement.AppliesTo.PRIMARY,
        )

    def test_answering_updates_the_legacy_columns(self):
        save_requirement_answers(self.guest, {'aso_ebi': 6}, collect_on='preferences')
        self.guest.refresh_from_db()
        self.assertTrue(self.guest.aso_ebi_requested)
        self.assertEqual(self.guest.aso_ebi_quantity, 6)

    def test_changing_the_answer_updates_the_legacy_columns(self):
        save_requirement_answers(self.guest, {'aso_ebi': 6}, collect_on='preferences')
        save_requirement_answers(self.guest, {'aso_ebi': 10}, collect_on='preferences')
        self.guest.refresh_from_db()
        self.assertEqual(self.guest.aso_ebi_quantity, 10)

    def test_clearing_the_answer_clears_the_legacy_columns(self):
        save_requirement_answers(self.guest, {'aso_ebi': 6}, collect_on='preferences')
        save_requirement_answers(self.guest, {'aso_ebi': None}, collect_on='preferences')
        self.guest.refresh_from_db()
        self.assertFalse(self.guest.aso_ebi_requested)
        self.assertEqual(self.guest.aso_ebi_quantity, 0)

    def test_other_questions_do_not_touch_the_legacy_columns(self):
        GuestRequirement.objects.create(
            event=self.event, key='meal', label='Meal',
            kind=GuestRequirement.Kind.CHOICE, options=['Chicken'],
        )
        self.guest.aso_ebi_requested = True
        self.guest.aso_ebi_quantity = 4
        self.guest.save()

        save_requirement_answers(self.guest, {'meal': 'Chicken'}, collect_on='preferences')
        self.guest.refresh_from_db()
        self.assertTrue(self.guest.aso_ebi_requested)
        self.assertEqual(self.guest.aso_ebi_quantity, 4)


class DescribeRequirementsTests(TestCase):
    def setUp(self):
        self.event = make_event()
        self.guest = Guest.objects.create(
            event=self.event, full_name='Guest', phone_number='+2348010000040',
        )

    def test_stored_answers_are_returned_so_a_guest_sees_what_they_said(self):
        GuestRequirement.objects.create(
            event=self.event, key='meal', label='Meal',
            kind=GuestRequirement.Kind.CHOICE, options=['Chicken', 'Fish'],
        )
        save_requirement_answers(self.guest, {'meal': 'Fish'}, collect_on='preferences')
        described = describe_requirements(
            self.event, collect_on='preferences', guest=self.guest,
        )
        self.assertEqual(described[0]['value'], 'Fish')

    def test_unanswered_questions_report_no_value(self):
        GuestRequirement.objects.create(
            event=self.event, key='meal', label='Meal',
            kind=GuestRequirement.Kind.CHOICE, options=['Chicken'],
        )
        described = describe_requirements(
            self.event, collect_on='preferences', guest=self.guest,
        )
        self.assertIsNone(described[0]['value'])

    def test_quantity_reports_its_unit(self):
        GuestRequirement.objects.create(
            event=self.event, key='fabric', label='Fabric',
            kind=GuestRequirement.Kind.QUANTITY, unit='metres',
        )
        described = describe_requirements(self.event, collect_on='preferences')
        self.assertEqual(described[0]['unit'], 'metres')

    def test_questions_come_back_in_configured_order(self):
        GuestRequirement.objects.create(
            event=self.event, key='b', label='B', kind=GuestRequirement.Kind.TEXT, position=2,
        )
        GuestRequirement.objects.create(
            event=self.event, key='a', label='A', kind=GuestRequirement.Kind.TEXT, position=1,
        )
        described = describe_requirements(self.event, collect_on='preferences')
        self.assertEqual([item['key'] for item in described], ['a', 'b'])
