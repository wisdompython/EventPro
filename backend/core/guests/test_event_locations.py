"""Multi-location events — weddings that run church, then reception.

Event.date and Event.venue stay the event's headline, so an event with no
locations behaves exactly as it did before this feature existed. These tests
pin that fallback as much as they pin the new behaviour.
"""
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Membership, MembershipRole, Organization, Role, User

from .models import Event, EventLocation, Guest, WhatsAppTemplate
from .whatsapp import _location_vars, _resolve_template_params


def make_event(organization, **kwargs):
    defaults = {
        'name': 'Wedding',
        'date': timezone.now() + timezone.timedelta(days=30),
        'venue': 'Main Venue',
        'organization': organization,
    }
    defaults.update(kwargs)
    return Event.objects.create(**defaults)


class EventLocationModelTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(
            name='Loc Co', slug='loc-co', timezone='Africa/Lagos',
        )
        self.event = make_event(self.organization)

    def test_locations_keep_the_organisers_order_not_chronological(self):
        """A stop with no confirmed time must not jump ahead of a timed one."""
        EventLocation.objects.create(
            event=self.event, name='Reception', sort_order=1,
            starts_at=timezone.now() + timezone.timedelta(days=30, hours=5),
        )
        EventLocation.objects.create(
            event=self.event, name='Church', sort_order=0, starts_at=None,
        )

        self.assertEqual(
            [location.name for location in self.event.locations.all()],
            ['Church', 'Reception'],
        )

    def test_deleting_an_event_removes_its_locations(self):
        EventLocation.objects.create(event=self.event, name='Church')
        self.event.delete()

        self.assertEqual(EventLocation.objects.count(), 0)


class LocationTemplateVariableTests(TestCase):
    """The variables a template's placeholders are filled from."""

    def setUp(self):
        self.organization = Organization.objects.create(
            name='Var Co', slug='var-co', timezone='Africa/Lagos',
        )
        self.event = make_event(
            self.organization,
            date=timezone.make_aware(timezone.datetime(2026, 6, 25, 11, 0)),
        )

    def _add_stops(self):
        EventLocation.objects.create(
            event=self.event, name='Church', venue="St Mary's", sort_order=0,
            starts_at=timezone.make_aware(timezone.datetime(2026, 6, 25, 11, 0)),
        )
        EventLocation.objects.create(
            event=self.event, name='Reception', venue='The Dome', sort_order=1,
            starts_at=timezone.make_aware(timezone.datetime(2026, 6, 25, 16, 0)),
        )

    def test_schedule_joins_every_stop_into_one_parameter(self):
        """One placeholder holds the whole schedule, however many stops."""
        self._add_stops()

        schedule = _location_vars(self.event)['schedule']

        self.assertEqual(
            schedule,
            "Church: St Mary's, 25th June 2026, 11:00 AM\n"
            'Reception: The Dome, 25th June 2026, 4:00 PM',
        )

    def test_indexed_variables_map_each_stop_to_its_own_placeholder(self):
        self._add_stops()

        resolved = _location_vars(self.event)

        self.assertEqual(resolved['location_1_name'], 'Church')
        self.assertEqual(resolved['location_1_venue'], "St Mary's")
        self.assertEqual(resolved['location_2_name'], 'Reception')
        self.assertEqual(resolved['location_2_venue'], 'The Dome')

    def test_unused_indexed_variables_resolve_to_empty_not_missing(self):
        """A 3-location template used on a 2-location event must not error."""
        self._add_stops()

        resolved = _location_vars(self.event)

        self.assertEqual(resolved['location_3_name'], '')
        self.assertEqual(resolved['location_3_venue'], '')
        self.assertEqual(resolved['location_3_time'], '')

    def test_event_without_locations_falls_back_to_its_own_venue_and_date(self):
        """A single-venue dinner still renders a wedding-shaped template."""
        resolved = _location_vars(self.event)

        self.assertEqual(resolved['location_1_venue'], 'Main Venue')
        self.assertIn('Main Venue', resolved['schedule'])
        self.assertEqual(resolved['location_2_name'], '')

    def test_a_stop_with_no_confirmed_time_still_reads_cleanly(self):
        EventLocation.objects.create(
            event=self.event, name='Reception', venue='The Dome',
            starts_at=None, sort_order=0,
        )

        schedule = _location_vars(self.event)['schedule']

        self.assertEqual(schedule, 'Reception: The Dome')

    def test_resolver_feeds_the_template_params_a_send_actually_uses(self):
        self._add_stops()
        guest = Guest.objects.create(
            event=self.event, full_name='Ada Guest', phone_number='2348000000001',
        )

        params = _resolve_template_params(
            guest, ['guest_name', 'location_1_name', 'location_2_venue'],
        )

        self.assertEqual(params, ['Ada Guest', 'Church', 'The Dome'])

    def test_every_advertised_location_variable_actually_resolves(self):
        """AVAILABLE_VARS must not offer a key the resolver cannot fill."""
        self._add_stops()
        guest = Guest.objects.create(
            event=self.event, full_name='Ada', phone_number='2348000000002',
        )
        location_keys = [
            key for key, _ in WhatsAppTemplate.AVAILABLE_VARS
            if key.startswith('location_') or key == 'schedule'
        ]

        resolved = _location_vars(self.event)

        for key in location_keys:
            self.assertIn(key, resolved, f'{key} is offered but never resolved')
        # And they survive the ordered-params path the send uses.
        self.assertEqual(len(_resolve_template_params(guest, location_keys)), len(location_keys))


class EventLocationApiTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(
            name='Api Loc Co', slug='api-loc-co', timezone='Africa/Lagos',
        )
        self.user = User.objects.create_user(
            'loc-owner', password='pass', role=Role.SUPER_ADMIN,
        )
        Membership.objects.create(
            organization=self.organization, user=self.user, role=MembershipRole.OWNER,
        )
        self.client = APIClient()
        self.client.force_login(self.user)

    def test_create_an_event_with_a_schedule(self):
        response = self.client.post('/api/events/', {
            'name': 'Wedding',
            'date': (timezone.now() + timezone.timedelta(days=30)).isoformat(),
            'venue': 'Main',
            'locations_setup': [
                {'name': 'Church', 'venue': "St Mary's", 'starts_at': None},
                {'name': 'Reception', 'venue': 'The Dome', 'starts_at': None},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            [item['name'] for item in response.data['locations']],
            ['Church', 'Reception'],
        )

    def test_creating_without_locations_still_works(self):
        """The single-venue path must stay exactly as simple as it was."""
        response = self.client.post('/api/events/', {
            'name': 'Corporate Dinner',
            'date': (timezone.now() + timezone.timedelta(days=10)).isoformat(),
            'venue': 'Eko Hotel',
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['locations'], [])

    def test_editing_replaces_the_schedule(self):
        event = make_event(self.organization)
        EventLocation.objects.create(event=event, name='Old', sort_order=0)

        response = self.client.patch(f'/api/events/{event.id}/', {
            'locations_setup': [{'name': 'Church', 'venue': "St Mary's"}],
        }, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([item['name'] for item in response.data['locations']], ['Church'])

    def test_omitting_locations_on_edit_leaves_them_alone(self):
        event = make_event(self.organization)
        EventLocation.objects.create(event=event, name='Church', sort_order=0)

        response = self.client.patch(
            f'/api/events/{event.id}/', {'venue': 'Updated'}, format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([item['name'] for item in response.data['locations']], ['Church'])

    def test_an_empty_list_clears_the_schedule(self):
        event = make_event(self.organization)
        EventLocation.objects.create(event=event, name='Church', sort_order=0)

        response = self.client.patch(
            f'/api/events/{event.id}/', {'locations_setup': []}, format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['locations'], [])

    def test_a_location_without_a_name_is_rejected(self):
        response = self.client.post('/api/events/', {
            'name': 'Wedding',
            'date': (timezone.now() + timezone.timedelta(days=30)).isoformat(),
            'locations_setup': [{'name': '', 'venue': "St Mary's"}],
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('locations_setup', response.data)

    def test_blank_repeater_rows_are_dropped_not_rejected(self):
        """A half-finished row must not block the whole save."""
        response = self.client.post('/api/events/', {
            'name': 'Wedding',
            'date': (timezone.now() + timezone.timedelta(days=30)).isoformat(),
            'locations_setup': [
                {'name': 'Church', 'venue': "St Mary's"},
                {'name': '', 'venue': '', 'starts_at': None},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(response.data['locations']), 1)

    def test_too_many_locations_is_rejected(self):
        response = self.client.post('/api/events/', {
            'name': 'Wedding',
            'date': (timezone.now() + timezone.timedelta(days=30)).isoformat(),
            'locations_setup': [
                {'name': f'Stop {index}'} for index in range(11)
            ],
        }, format='json')

        self.assertEqual(response.status_code, 400)

    def test_another_organization_cannot_see_the_schedule(self):
        other_org = Organization.objects.create(
            name='Other', slug='other-loc', timezone='Africa/Lagos',
        )
        other_event = make_event(other_org, name='Their Wedding')
        EventLocation.objects.create(event=other_event, name='Their Church')

        response = self.client.get(f'/api/events/{other_event.id}/')

        self.assertEqual(response.status_code, 404)


class MultipartLocationsTests(TestCase):
    """The event forms submit multipart, so locations arrive as a JSON string."""

    def setUp(self):
        self.organization = Organization.objects.create(
            name='Multipart Co', slug='multipart-co', timezone='Africa/Lagos',
        )
        self.user = User.objects.create_user(
            'mp-owner', password='pass', role=Role.SUPER_ADMIN,
        )
        Membership.objects.create(
            organization=self.organization, user=self.user, role=MembershipRole.OWNER,
        )
        self.client = APIClient()
        self.client.force_login(self.user)

    def test_locations_sent_as_a_json_string_are_parsed(self):
        import json

        response = self.client.post('/api/events/', {
            'name': 'Wedding',
            'date': (timezone.now() + timezone.timedelta(days=30)).isoformat(),
            'venue': 'Main',
            'locations_setup': json.dumps([
                {'name': 'Church', 'venue': "St Mary's", 'starts_at': None},
                {'name': 'Reception', 'venue': 'The Dome', 'starts_at': None},
            ]),
        }, format='multipart')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            [item['name'] for item in response.data['locations']],
            ['Church', 'Reception'],
        )

    def test_malformed_json_string_is_rejected_cleanly(self):
        response = self.client.post('/api/events/', {
            'name': 'Wedding',
            'date': (timezone.now() + timezone.timedelta(days=30)).isoformat(),
            'locations_setup': 'not json',
        }, format='multipart')

        self.assertEqual(response.status_code, 400)
        self.assertIn('locations_setup', response.data)
