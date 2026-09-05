"""Tests for the preference dashboard.

Covers the totals a planner hands to a vendor, the per-guest roster, and the
tenancy boundary.
"""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Membership, MembershipRole, Organization, Role, User

from .models import (
    Event,
    Guest,
    GuestRequirement,
    GuestRequirementResponse,
    SeatingSection,
    SeatingTable,
)


class PreferenceDashboardTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.org = Organization.objects.create(name='Planner Co', slug='planner-co')
        self.user = User.objects.create_user(
            'planner', password='pass', role=Role.EVENT_MANAGER,
        )
        Membership.objects.create(
            user=self.user, organization=self.org, role=MembershipRole.MANAGER,
        )
        self.event = Event.objects.create(
            name='Our Event', date=timezone.now() + timedelta(days=30),
            organization=self.org,
        )

        self.meal = GuestRequirement.objects.create(
            event=self.event, key='meal_choice', label='Meal choice',
            kind=GuestRequirement.Kind.CHOICE,
            options=['Chicken', 'Fish', 'Vegetarian'], position=0,
        )
        self.dietary = GuestRequirement.objects.create(
            event=self.event, key='dietary', label='Dietary needs',
            kind=GuestRequirement.Kind.MULTI_CHOICE,
            options=['Nuts', 'Dairy', 'Halal'], position=1,
        )
        self.fabric = GuestRequirement.objects.create(
            event=self.event, key='aso_ebi', label='Aso Ebi',
            kind=GuestRequirement.Kind.QUANTITY, unit='yards', position=2,
        )
        self.shuttle = GuestRequirement.objects.create(
            event=self.event, key='transport', label='Shuttle seat',
            kind=GuestRequirement.Kind.BOOLEAN, position=3,
        )

        self.amaka = Guest.objects.create(
            event=self.event, full_name='Amaka Obi', phone_number='+2348000000001',
            preferences_submitted_at=timezone.now(),
        )
        self.tobi = Guest.objects.create(
            event=self.event, full_name='Tobi Bello', phone_number='+2348000000002',
            preferences_submitted_at=timezone.now(),
        )
        # Never answered — should show as outstanding.
        self.chika = Guest.objects.create(
            event=self.event, full_name='Chika Nwosu', phone_number='+2348000000003',
        )

        GuestRequirementResponse.objects.create(
            requirement=self.meal, guest=self.amaka, value_text='Chicken',
        )
        GuestRequirementResponse.objects.create(
            requirement=self.meal, guest=self.tobi, value_text='Chicken',
        )
        GuestRequirementResponse.objects.create(
            requirement=self.dietary, guest=self.amaka, value_json=['Nuts', 'Dairy'],
        )
        GuestRequirementResponse.objects.create(
            requirement=self.dietary, guest=self.tobi, value_json=['Nuts'],
        )
        GuestRequirementResponse.objects.create(
            requirement=self.fabric, guest=self.amaka, value_int=5,
        )
        GuestRequirementResponse.objects.create(
            requirement=self.fabric, guest=self.tobi, value_int=3,
        )
        GuestRequirementResponse.objects.create(
            requirement=self.shuttle, guest=self.amaka, value_bool=True,
        )
        GuestRequirementResponse.objects.create(
            requirement=self.shuttle, guest=self.tobi, value_bool=False,
        )

        self.client.force_authenticate(self.user)
        session = self.client.session
        session['active_organization_id'] = self.org.id
        session.save()

    def get(self, **params):
        query = '&'.join(f'{k}={v}' for k, v in params.items())
        return self.client.get(f'/api/preferences/dashboard/?event={self.event.id}&{query}')


class TotalsTests(PreferenceDashboardTestCase):
    def test_choice_questions_break_down_by_option(self):
        response = self.get()
        self.assertEqual(response.status_code, 200, response.data)
        meal = next(q for q in response.data['questions'] if q['key'] == 'meal_choice')
        self.assertEqual(meal['breakdown'], [
            {'label': 'Chicken', 'count': 2},
            {'label': 'Fish', 'count': 0},
            {'label': 'Vegetarian', 'count': 0},
        ])
        self.assertEqual(meal['answered'], 2)
        self.assertEqual(meal['selection_count'], 2)

    def test_multi_choice_counts_each_selection(self):
        """A guest picking two allergies contributes to both counts."""
        response = self.get()
        dietary = next(q for q in response.data['questions'] if q['key'] == 'dietary')
        counts = {row['label']: row['count'] for row in dietary['breakdown']}
        self.assertEqual(counts, {'Nuts': 2, 'Dairy': 1, 'Halal': 0})
        # Two guests answered, even though there are three selections.
        self.assertEqual(dietary['answered'], 2)
        self.assertEqual(dietary['selection_count'], 3)

    def test_removed_option_with_existing_answers_is_not_lost(self):
        """Historical choices remain visible after a menu option is changed."""
        self.meal.options = ['Fish', 'Vegetarian']
        self.meal.save(update_fields=['options'])

        response = self.get()
        meal = next(q for q in response.data['questions'] if q['key'] == 'meal_choice')
        self.assertEqual(meal['breakdown'], [
            {'label': 'Fish', 'count': 0},
            {'label': 'Vegetarian', 'count': 0},
            {'label': 'Chicken', 'count': 2},
        ])

    def test_quantity_questions_sum(self):
        """This is the number that goes to the fabric vendor."""
        response = self.get()
        fabric = next(q for q in response.data['questions'] if q['key'] == 'aso_ebi')
        self.assertEqual(fabric['total'], 8)
        self.assertEqual(fabric['answered'], 2)
        self.assertEqual(fabric['unit'], 'yards')

    def test_boolean_questions_split_yes_and_no(self):
        response = self.get()
        shuttle = next(q for q in response.data['questions'] if q['key'] == 'transport')
        counts = {row['label']: row['count'] for row in shuttle['breakdown']}
        self.assertEqual(counts, {'Yes': 1, 'No': 1})

    def test_summary_counts_outstanding_guests(self):
        response = self.get()
        self.assertEqual(response.data['summary']['total'], 3)
        self.assertEqual(response.data['summary']['submitted'], 2)
        self.assertEqual(response.data['summary']['outstanding'], 1)


class RosterTests(PreferenceDashboardTestCase):
    def test_every_guest_appears_with_their_answers(self):
        response = self.get()
        roster = {row['full_name']: row for row in response.data['guests']}
        self.assertEqual(set(roster), {'Amaka Obi', 'Tobi Bello', 'Chika Nwosu'})

        amaka = roster['Amaka Obi']
        answers = {a['key']: a['value'] for a in amaka['answers']}
        self.assertEqual(answers['meal_choice'], 'Chicken')
        self.assertEqual(answers['dietary'], 'Nuts, Dairy')
        self.assertEqual(answers['aso_ebi'], '5 yards')
        self.assertEqual(answers['transport'], 'Yes')

    def test_a_guest_who_never_answered_still_appears(self):
        """An outstanding guest is the most important row on the page."""
        response = self.get()
        chika = next(r for r in response.data['guests'] if r['full_name'] == 'Chika Nwosu')
        self.assertEqual(chika['answers'], [])
        self.assertIsNone(chika['submitted_at'])

    def test_search_filters_by_name(self):
        response = self.get(search='Amaka')
        names = [row['full_name'] for row in response.data['guests']]
        self.assertEqual(names, ['Amaka Obi'])

    def test_answered_filter_finds_outstanding_guests(self):
        response = self.get(answered='no')
        names = [row['full_name'] for row in response.data['guests']]
        self.assertEqual(names, ['Chika Nwosu'])

    def test_columns_describe_the_questions_asked(self):
        response = self.get()
        keys = [column['key'] for column in response.data['columns']]
        self.assertEqual(keys, ['meal_choice', 'dietary', 'aso_ebi', 'transport'])

    def test_roster_does_not_scale_queries_with_guest_count(self):
        """One query for guests and one for answers, however many there are."""
        for index in range(25):
            guest = Guest.objects.create(
                event=self.event, full_name=f'Extra {index:02d}',
                phone_number=f'+23470000{index:05d}',
            )
            GuestRequirementResponse.objects.create(
                requirement=self.meal, guest=guest, value_text='Fish',
            )
        with self.assertNumQueries(2):
            from .domains import preferences
            preferences.guest_roster(self.event.id)


class SeatingServicePlanTests(PreferenceDashboardTestCase):
    def setUp(self):
        super().setUp()
        section = SeatingSection.objects.create(
            event=self.event, name='High table', prefix='HT', position=0,
        )
        self.table = SeatingTable.objects.create(
            event=self.event, section=section, label='HT-01', seats=10,
        )
        self.amaka.table_number = self.table.label
        self.amaka.seat_number = '1'
        self.amaka.status = Guest.Status.CHECKED_IN
        self.amaka.save(update_fields=['table_number', 'seat_number', 'status'])
        self.tobi.table_number = self.table.label
        self.tobi.seat_number = '2'
        self.tobi.save(update_fields=['table_number', 'seat_number'])

    def test_preferences_are_collated_by_seating_table(self):
        response = self.get()
        high_table = next(
            table for table in response.data['seating']
            if table['table_label'] == 'HT-01'
        )

        self.assertEqual(high_table['section_name'], 'High table')
        self.assertEqual(high_table['guest_count'], 2)
        self.assertEqual(high_table['checked_in_count'], 1)
        self.assertEqual(high_table['responded_count'], 2)
        meal = next(total for total in high_table['totals'] if total['key'] == 'meal_choice')
        self.assertEqual(meal['breakdown'], [{'label': 'Chicken', 'count': 2}])
        fabric = next(total for total in high_table['totals'] if total['key'] == 'aso_ebi')
        self.assertEqual(fabric['total'], 8)

    def test_table_card_contains_seat_by_seat_answers(self):
        response = self.get()
        high_table = next(
            table for table in response.data['seating']
            if table['table_label'] == 'HT-01'
        )
        amaka = next(guest for guest in high_table['guests'] if guest['full_name'] == 'Amaka Obi')
        answers = {answer['label']: answer['value'] for answer in amaka['answers']}
        self.assertEqual(amaka['seat_number'], '1')
        self.assertTrue(amaka['checked_in'])
        self.assertEqual(answers['Meal choice'], 'Chicken')
        self.assertEqual(answers['Dietary needs'], 'Nuts, Dairy')

    def test_numeric_seat_numbers_are_served_in_natural_order(self):
        self.amaka.seat_number = '10'
        self.amaka.save(update_fields=['seat_number'])
        self.tobi.seat_number = '2'
        self.tobi.save(update_fields=['seat_number'])

        response = self.get()
        high_table = next(
            table for table in response.data['seating']
            if table['table_label'] == 'HT-01'
        )
        self.assertEqual(
            [guest['seat_number'] for guest in high_table['guests']],
            ['2', '10'],
        )

    def test_guests_without_tables_are_kept_in_an_attention_bucket(self):
        response = self.get()
        unassigned = next(
            table for table in response.data['seating'] if table['unassigned']
        )
        self.assertEqual(unassigned['table_label'], 'Unassigned guests')
        self.assertEqual([guest['full_name'] for guest in unassigned['guests']], ['Chika Nwosu'])


class LegacyFieldTests(PreferenceDashboardTestCase):
    def test_aso_ebi_columns_are_totalled(self):
        """Aso Ebi predates the builder and lives on Guest, not a response."""
        self.amaka.aso_ebi_requested = True
        self.amaka.aso_ebi_quantity = 6
        self.amaka.save()
        self.tobi.aso_ebi_requested = True
        self.tobi.aso_ebi_quantity = 4
        self.tobi.save()

        response = self.get()
        self.assertEqual(response.data['legacy']['aso_ebi_guests'], 2)
        self.assertEqual(response.data['legacy']['aso_ebi_quantity'], 10)

    def test_aso_ebi_is_marked_superseded_when_a_question_asks_for_it(self):
        """The fabric total must not appear twice with two different numbers.

        This event configures an Aso Ebi quantity question in setUp, so the
        legacy Guest columns are superseded and the page hides them.
        """
        response = self.get()
        self.assertTrue(response.data['legacy']['aso_ebi_superseded'])

    def test_legacy_aso_ebi_shows_when_no_question_asks_for_it(self):
        self.fabric.delete()
        response = self.get()
        self.assertFalse(response.data['legacy']['aso_ebi_superseded'])

    def test_plus_ones_are_counted(self):
        self.amaka.plus_one_attending = True
        self.amaka.save()
        response = self.get()
        self.assertEqual(response.data['legacy']['plus_ones'], 1)


class DashboardTenancyTests(PreferenceDashboardTestCase):
    def test_another_organisations_event_is_not_found(self):
        other_org = Organization.objects.create(name='Rival Co', slug='rival-co')
        other_event = Event.objects.create(
            name='Rival Event', date=timezone.now() + timedelta(days=30),
            organization=other_org,
        )
        response = self.client.get(f'/api/preferences/dashboard/?event={other_event.id}')
        self.assertEqual(response.status_code, 404)

    def test_an_event_is_required(self):
        response = self.client.get('/api/preferences/dashboard/')
        self.assertEqual(response.status_code, 400)
