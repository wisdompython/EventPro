"""API tests for the seating plan builder.

Covers tenancy isolation, section creation with its tables, prefix derivation,
label uniqueness, the drag/position write, and assigning guests to a table.
"""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Membership, MembershipRole, Organization, Role, User

from .models import Event, Guest, SeatingSection, SeatingTable
from .views.seating import derive_prefix


class SeatingApiTestCase(TestCase):
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

        # A second organisation that must never be reachable.
        self.other_org = Organization.objects.create(name='Rival Co', slug='rival-co')
        self.other_event = Event.objects.create(
            name='Rival Event', date=timezone.now() + timedelta(days=30),
            organization=self.other_org,
        )
        self.other_section = SeatingSection.objects.create(
            event=self.other_event, name='Secret section', prefix='SS',
        )

        self.client.force_authenticate(self.user)
        session = self.client.session
        session['active_organization_id'] = self.org.id
        session.save()


class PrefixTests(TestCase):
    def test_multi_word_names_use_initials(self):
        self.assertEqual(derive_prefix('Grooms family'), 'GF')
        self.assertEqual(derive_prefix('High table'), 'HT')

    def test_single_word_names_use_first_letters(self):
        self.assertEqual(derive_prefix('Sponsors'), 'SPO')

    def test_punctuation_is_ignored(self):
        self.assertEqual(derive_prefix("Bride's side"), 'BS')

    def test_empty_name_still_yields_a_prefix(self):
        self.assertEqual(derive_prefix('   '), 'S')


class SectionCrudTests(SeatingApiTestCase):
    def test_creating_a_section_creates_its_tables(self):
        response = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Grooms family',
            'table_count': 6, 'seats_per_table': 8,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['prefix'], 'GF')

        labels = [table['label'] for table in response.data['tables']]
        self.assertEqual(labels, ['GF-01', 'GF-02', 'GF-03', 'GF-04', 'GF-05', 'GF-06'])
        self.assertTrue(all(table['seats'] == 8 for table in response.data['tables']))

    def test_a_section_can_start_with_no_tables(self):
        response = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Overflow',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['tables'], [])

    def test_tables_are_laid_out_in_a_grid(self):
        response = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Main floor',
            'table_count': 4, 'columns': 2,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        points = [(table['x'], table['y']) for table in response.data['tables']]
        # Two per row, so the third table starts a new row.
        self.assertEqual(points[0][1], points[1][1])
        self.assertGreater(points[2][1], points[0][1])

    def test_section_names_are_unique_per_event(self):
        SeatingSection.objects.create(event=self.event, name='High table', prefix='HT')
        response = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'High table',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('name', response.data)

    def test_clashing_prefixes_are_made_unique(self):
        self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Grooms family',
        }, format='json')
        # "Guests family" would also derive GF.
        response = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Guests family',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotEqual(response.data['prefix'], 'GF')

    def test_list_is_scoped_to_the_organisation(self):
        SeatingSection.objects.create(event=self.event, name='Ours', prefix='O')
        response = self.client.get('/api/seating-sections/')
        self.assertEqual(response.status_code, 200)
        names = [row['name'] for row in response.data]
        self.assertEqual(names, ['Ours'])
        self.assertNotIn('Secret section', names)

    def test_cannot_create_on_another_organisations_event(self):
        response = self.client.post('/api/seating-sections/', {
            'event': self.other_event.id, 'name': 'Intruder',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('event', response.data)

    def test_cannot_read_another_organisations_section(self):
        response = self.client.get(f'/api/seating-sections/{self.other_section.id}/')
        self.assertEqual(response.status_code, 404)

    def test_deleting_a_section_removes_its_tables(self):
        created = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Temporary', 'table_count': 3,
        }, format='json').data
        response = self.client.delete(f'/api/seating-sections/{created["id"]}/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(SeatingTable.objects.filter(event=self.event).count(), 0)


class VenueFeatureTests(SeatingApiTestCase):
    def test_creating_a_feature_takes_no_prefix_or_tables(self):
        response = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Band', 'kind': 'feature',
            'feature': 'stage', 'table_count': 6,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['kind'], 'feature')
        self.assertEqual(response.data['feature'], 'stage')
        self.assertEqual(response.data['prefix'], '')
        # A stage seats nobody, so the table_count is ignored.
        self.assertEqual(response.data['tables'], [])

    def test_several_features_can_coexist_without_prefixes(self):
        """Blank prefixes must not trip the per-event uniqueness rule."""
        for name, feature in (('Main entrance', 'entrance'), ('Fire exit', 'exit'), ('Walkway', 'walkway')):
            response = self.client.post('/api/seating-sections/', {
                'event': self.event.id, 'name': name,
                'kind': 'feature', 'feature': feature,
            }, format='json')
            self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            SeatingSection.objects.filter(event=self.event, prefix='').count(), 3,
        )
    def test_features_and_table_sections_share_the_plan(self):
        self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Grooms family', 'table_count': 2,
        }, format='json')
        self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Dance floor',
            'kind': 'feature', 'feature': 'dancefloor',
        }, format='json')

        response = self.client.get(f'/api/seating-sections/?event={self.event.id}')
        self.assertEqual(response.status_code, 200)
        kinds = sorted(row['kind'] for row in response.data)
        self.assertEqual(kinds, ['feature', 'tables'])

    def test_a_feature_refuses_tables(self):
        feature = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Bar',
            'kind': 'feature', 'feature': 'bar',
        }, format='json').data
        response = self.client.post(
            f'/api/seating-sections/{feature["id"]}/add_tables/',
            {'count': 2}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_a_route_gets_editable_default_points(self):
        response = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Gate to car park',
            'kind': 'feature', 'feature': 'path',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(response.data['path_points']), 3)

        route_id = response.data['id']
        points = [
            {'x': 0.05, 'y': 0.2},
            {'x': 0.45, 'y': 0.8},
            {'x': 0.95, 'y': 0.35},
        ]
        updated = self.client.patch(
            f'/api/seating-sections/{route_id}/',
            {'path_points': points}, format='json',
        )
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data['path_points'], points)

    def test_a_route_rejects_points_outside_its_bounds(self):
        response = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Invalid route',
            'kind': 'feature', 'feature': 'path',
            'path_points': [{'x': 0, 'y': 0}, {'x': 1.5, 'y': 1}],
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('path_points', response.data)


class CanvasDimensionsTests(SeatingApiTestCase):
    def test_canvas_dimensions_are_persisted_on_the_event(self):
        response = self.client.patch(f'/api/events/{self.event.id}/', {
            'seating_plan_width': 2400,
            'seating_plan_height': 1800,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.event.refresh_from_db()
        self.assertEqual(self.event.seating_plan_width, 2400)
        self.assertEqual(self.event.seating_plan_height, 1800)

    def test_canvas_dimensions_reject_an_unusable_size(self):
        response = self.client.patch(f'/api/events/{self.event.id}/', {
            'seating_plan_width': 400,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('seating_plan_width', response.data)


class ConnectorTests(SeatingApiTestCase):
    def setUp(self):
        super().setUp()
        self.block = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Main floor', 'table_count': 2,
        }, format='json').data
        self.route = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Guest aisle',
            'kind': 'feature', 'feature': 'path',
        }, format='json').data

    def test_a_route_can_be_anchored_to_a_section(self):
        response = self.client.patch(
            f'/api/seating-sections/{self.route["id"]}/',
            {'path_end_section': self.block['id']}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['path_end_section'], self.block['id'])

    def test_a_route_can_be_anchored_to_a_table(self):
        table_id = self.block['tables'][0]['id']
        response = self.client.patch(
            f'/api/seating-sections/{self.route["id"]}/',
            {'path_start_table': table_id}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['path_start_table'], table_id)

    def test_a_route_cannot_anchor_to_another_events_block(self):
        response = self.client.patch(
            f'/api/seating-sections/{self.route["id"]}/',
            {'path_end_section': self.other_section.id}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('path_end_section', response.data)

    def test_a_route_cannot_connect_to_itself(self):
        response = self.client.patch(
            f'/api/seating-sections/{self.route["id"]}/',
            {'path_start_section': self.route['id']}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('path_start_section', response.data)

    def test_arrowheads_are_configurable(self):
        response = self.client.patch(
            f'/api/seating-sections/{self.route["id"]}/',
            {'path_arrows': 'both'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['path_arrows'], 'both')

    def test_deleting_an_anchor_block_leaves_the_route(self):
        """SET_NULL, so removing a block frees the route rather than deleting it."""
        self.client.patch(
            f'/api/seating-sections/{self.route["id"]}/',
            {'path_end_section': self.block['id']}, format='json',
        )
        self.client.delete(f'/api/seating-sections/{self.block["id"]}/')

        response = self.client.get(f'/api/seating-sections/{self.route["id"]}/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['path_end_section'])

    def test_bends_are_saved_as_normalised_points(self):
        response = self.client.patch(
            f'/api/seating-sections/{self.route["id"]}/',
            {'path_points': [{'x': 0, 'y': 0.5}, {'x': 0.4, 'y': 0.2}, {'x': 1, 'y': 0.5}]},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data['path_points']), 3)


class AddTablesTests(SeatingApiTestCase):
    def setUp(self):
        super().setUp()
        self.section = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Grooms family', 'table_count': 2,
        }, format='json').data

    def test_add_tables_continues_the_numbering(self):
        response = self.client.post(
            f'/api/seating-sections/{self.section["id"]}/add_tables/',
            {'count': 2}, format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        labels = [table['label'] for table in response.data['tables']]
        self.assertEqual(labels, ['GF-01', 'GF-02', 'GF-03', 'GF-04'])

    def test_add_tables_rejects_a_silly_count(self):
        response = self.client.post(
            f'/api/seating-sections/{self.section["id"]}/add_tables/',
            {'count': 0}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_relayout_tidies_the_grid(self):
        table = SeatingTable.objects.filter(event=self.event).first()
        table.x, table.y = 999, 999
        table.save()

        response = self.client.post(
            f'/api/seating-sections/{self.section["id"]}/relayout/', {}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        table.refresh_from_db()
        self.assertLess(table.x, 999)


class SeatingPositionTests(SeatingApiTestCase):
    def setUp(self):
        super().setUp()
        self.section_data = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Main floor', 'table_count': 2,
        }, format='json').data

    def test_positions_moves_sections_and_tables(self):
        table_id = self.section_data['tables'][0]['id']
        response = self.client.post('/api/seating-sections/positions/', {
            'event': self.event.id,
            'sections': [{'id': self.section_data['id'], 'x': 200, 'y': 300}],
            'tables': [{'id': table_id, 'x': 40, 'y': 55}],
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['updated'], 2)

        section = SeatingSection.objects.get(pk=self.section_data['id'])
        table = SeatingTable.objects.get(pk=table_id)
        self.assertEqual((section.x, section.y), (200, 300))
        self.assertEqual((table.x, table.y), (40, 55))

    def test_positions_ignores_rows_from_another_event(self):
        response = self.client.post('/api/seating-sections/positions/', {
            'event': self.event.id,
            'sections': [{'id': self.other_section.id, 'x': 999, 'y': 999}],
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['updated'], 0)

        self.other_section.refresh_from_db()
        self.assertEqual((self.other_section.x, self.other_section.y), (0, 0))

    def test_positions_also_persists_a_resize(self):
        response = self.client.post('/api/seating-sections/positions/', {
            'event': self.event.id,
            'sections': [{
                'id': self.section_data['id'], 'x': 10, 'y': 20,
                'width': 640, 'height': 480,
            }],
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        section = SeatingSection.objects.get(pk=self.section_data['id'])
        self.assertEqual((section.width, section.height), (640, 480))

    def test_a_new_section_has_no_explicit_size(self):
        """Null size means "fit the tables" until the planner resizes it."""
        section = SeatingSection.objects.get(pk=self.section_data['id'])
        self.assertIsNone(section.width)
        self.assertIsNone(section.height)

    def test_positions_rejects_another_organisations_event(self):
        response = self.client.post('/api/seating-sections/positions/', {
            'event': self.other_event.id, 'sections': [],
        }, format='json')
        self.assertEqual(response.status_code, 404)


class SeatingAssignmentTests(SeatingApiTestCase):
    def setUp(self):
        super().setUp()
        section = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Main floor',
            'table_count': 1, 'seats_per_table': 8,
        }, format='json').data
        self.table_id = section['tables'][0]['id']
        self.table_label = section['tables'][0]['label']
        self.guest = Guest.objects.create(
            event=self.event, full_name='Amaka Obi', phone_number='+2348000000001',
        )

    def test_assigning_writes_the_guests_table_number(self):
        response = self.client.post(
            f'/api/seating-tables/{self.table_id}/assign/',
            {'add': [str(self.guest.id)]}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['seated'], 1)

        self.guest.refresh_from_db()
        self.assertEqual(self.guest.table_number, self.table_label)

    def test_removing_clears_the_table_and_seat(self):
        self.guest.table_number = self.table_label
        self.guest.seat_number = '3'
        self.guest.save()

        response = self.client.post(
            f'/api/seating-tables/{self.table_id}/assign/',
            {'remove': [str(self.guest.id)]}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['cleared'], 1)

        self.guest.refresh_from_db()
        self.assertEqual(self.guest.table_number, '')
        self.assertEqual(self.guest.seat_number, '')

    def test_guests_endpoint_splits_assigned_and_unassigned(self):
        seated = Guest.objects.create(
            event=self.event, full_name='Tobi Bello',
            phone_number='+2348000000002', table_number=self.table_label,
        )
        response = self.client.get(f'/api/seating-tables/{self.table_id}/guests/')
        self.assertEqual(response.status_code, 200)

        assigned_ids = {str(row['id']) for row in response.data['assigned']}
        unassigned_ids = {str(row['id']) for row in response.data['unassigned']}
        self.assertIn(str(seated.id), assigned_ids)
        self.assertIn(str(self.guest.id), unassigned_ids)
        self.assertEqual(response.data['seats'], 8)

    def test_list_reports_how_many_guests_are_seated(self):
        Guest.objects.create(
            event=self.event, full_name='Tobi Bello',
            phone_number='+2348000000002', table_number=self.table_label,
        )
        response = self.client.get(f'/api/seating-sections/?event={self.event.id}')
        self.assertEqual(response.status_code, 200)
        table = response.data[0]['tables'][0]
        self.assertEqual(table['assigned'], 1)

    def test_a_new_table_reports_zero_rather_than_null(self):
        """Regression: a missing count rendered as NaN in the builder."""
        response = self.client.post('/api/seating-sections/', {
            'event': self.event.id, 'name': 'Fresh', 'table_count': 1,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['tables'][0]['assigned'], 0)
