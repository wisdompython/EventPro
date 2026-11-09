"""Naming location placeholders after a real event's stops.

"Location 1 name" tells the person writing a template nothing — whether slot 1
is the church or the reception depends on the order set on whichever event it
is sent for. Passing an event to the variable list replaces those positional
labels with that event's own stop names.
"""
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Membership, MembershipRole, Organization, Role, User

from .models import Event, EventLocation, WhatsAppTemplate

VARS_URL = '/api/whatsapp-templates/available-vars/'


def make_event(organization, name='Wedding'):
    return Event.objects.create(
        name=name,
        date=timezone.now() + timezone.timedelta(days=30),
        venue='Main Venue',
        organization=organization,
    )


class AvailableVarsForEventTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(
            name='Vars Co', slug='vars-co', timezone='Africa/Lagos',
        )
        self.user = User.objects.create_user(
            'vars-manager', password='pass', role=Role.SUPER_ADMIN,
        )
        Membership.objects.create(
            organization=self.organization, user=self.user, role=MembershipRole.OWNER,
        )
        self.client = APIClient()
        self.client.force_login(self.user)
        self.event = make_event(self.organization)

    def _add_stops(self, *names):
        for position, name in enumerate(names):
            EventLocation.objects.create(
                event=self.event, name=name, venue=f'{name} Venue', sort_order=position,
            )

    def _labels(self, response):
        return {item['key']: item['label'] for item in response.data}

    def test_without_an_event_the_labels_stay_positional(self):
        response = self.client.get(VARS_URL)

        self.assertEqual(response.status_code, 200)
        labels = self._labels(response)
        self.assertEqual(labels['location_1_name'], 'Location 1 name')

    def test_with_an_event_slots_are_named_after_its_stops(self):
        self._add_stops('Church', 'Reception')

        response = self.client.get(VARS_URL, {'event': self.event.id})

        self.assertEqual(response.status_code, 200)
        labels = self._labels(response)
        self.assertEqual(labels['location_1_name'], 'Church - name')
        self.assertEqual(labels['location_1_venue'], 'Church - venue')
        self.assertEqual(labels['location_2_time'], 'Reception - time')

    def test_slots_the_event_has_no_stop_for_are_dropped(self):
        """A placeholder must not be mappable to a location that cannot exist."""
        self._add_stops('Church', 'Reception')

        response = self.client.get(VARS_URL, {'event': self.event.id})

        labels = self._labels(response)
        self.assertNotIn('location_3_name', labels)
        self.assertNotIn('location_3_venue', labels)

    def test_an_event_with_no_locations_offers_no_location_slots(self):
        response = self.client.get(VARS_URL, {'event': self.event.id})

        labels = self._labels(response)
        self.assertNotIn('location_1_name', labels)
        # The non-location variables are still all there.
        self.assertIn('guest_name', labels)
        self.assertIn('schedule', labels)

    def test_the_schedule_variable_survives_event_scoping(self):
        """`schedule` works for any event, so it must never be filtered out."""
        self._add_stops('Church')

        response = self.client.get(VARS_URL, {'event': self.event.id})

        self.assertIn('schedule', self._labels(response))

    def test_stops_beyond_the_supported_slot_count_are_ignored(self):
        self._add_stops('One', 'Two', 'Three', 'Four', 'Five')

        response = self.client.get(VARS_URL, {'event': self.event.id})

        labels = self._labels(response)
        self.assertEqual(labels['location_3_name'], 'Three - name')
        self.assertNotIn('location_4_name', labels)

    def test_an_unnamed_stop_falls_back_to_its_position(self):
        EventLocation.objects.create(event=self.event, name='', sort_order=0)

        response = self.client.get(VARS_URL, {'event': self.event.id})

        self.assertEqual(self._labels(response)['location_1_name'], 'Location 1 - name')

    def test_another_organizations_event_is_not_readable(self):
        other_org = Organization.objects.create(
            name='Other', slug='other-vars', timezone='Africa/Lagos',
        )
        other_event = make_event(other_org, name='Their Wedding')
        EventLocation.objects.create(event=other_event, name='Their Church', sort_order=0)

        response = self.client.get(VARS_URL, {'event': other_event.id})

        self.assertEqual(response.status_code, 404)

    def test_an_unknown_event_is_rejected(self):
        response = self.client.get(VARS_URL, {'event': 999999})

        self.assertEqual(response.status_code, 404)


class TemplateBuiltForEventTests(TestCase):
    """A template records which event's schedule it was numbered against."""

    def setUp(self):
        self.organization = Organization.objects.create(
            name='Built Co', slug='built-co', timezone='Africa/Lagos',
        )
        self.user = User.objects.create_user(
            'built-manager', password='pass', role=Role.SUPER_ADMIN,
        )
        Membership.objects.create(
            organization=self.organization, user=self.user, role=MembershipRole.OWNER,
        )
        self.client = APIClient()
        self.client.force_login(self.user)
        self.event = make_event(self.organization)
        EventLocation.objects.create(event=self.event, name='Church', sort_order=0)
        EventLocation.objects.create(event=self.event, name='Reception', sort_order=1)

    def test_creating_a_template_records_the_event_it_was_built_for(self):
        response = self.client.post('/api/whatsapp-templates/', {
            'name': 'wedding_invite_v1',
            'body_text': 'Hello {{1}}, join us at {{2}}',
            'body_params': ['guest_name', 'location_1_venue'],
            'built_for_event': self.event.id,
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['built_for_event_name'], 'Wedding')
        self.assertEqual(response.data['built_for_locations'], ['Church', 'Reception'])

    def test_the_reference_is_optional(self):
        response = self.client.post('/api/whatsapp-templates/', {
            'name': 'generic_v1',
            'body_text': 'Hello {{1}}',
            'body_params': ['guest_name'],
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(response.data['built_for_event'])
        self.assertEqual(response.data['built_for_locations'], [])

    def test_another_organizations_event_cannot_be_referenced(self):
        other_org = Organization.objects.create(
            name='Other', slug='other-built', timezone='Africa/Lagos',
        )
        other_event = make_event(other_org, name='Their Wedding')

        response = self.client.post('/api/whatsapp-templates/', {
            'name': 'leaky_v1',
            'body_text': 'Hello {{1}}',
            'body_params': ['guest_name'],
            'built_for_event': other_event.id,
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('built_for_event', response.data)

    def test_deleting_the_event_keeps_the_template(self):
        """The reference is a note, not a dependency — losing it must not delete work."""
        template = WhatsAppTemplate.objects.create(
            organization=self.organization,
            name='wedding_v1',
            body_text='Hello {{1}}',
            body_params=['guest_name'],
            built_for_event=self.event,
        )

        self.event.delete()
        template.refresh_from_db()

        self.assertIsNone(template.built_for_event)
        self.assertTrue(WhatsAppTemplate.objects.filter(pk=template.pk).exists())
