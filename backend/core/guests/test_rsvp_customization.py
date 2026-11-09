from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Membership, MembershipRole, Organization, Role, User
from guests.models import Event


class RsvpCustomizationApiTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name='Acme', slug='acme')
        self.other_organization = Organization.objects.create(name='Beta', slug='beta')
        self.event = Event.objects.create(
            organization=self.organization,
            name='Acme Summit',
            date=timezone.now() + timezone.timedelta(days=7),
        )
        self.other_event = Event.objects.create(
            organization=self.other_organization,
            name='Beta Summit',
            date=timezone.now() + timezone.timedelta(days=7),
        )
        self.owner = User.objects.create_user('acme-owner', password='secret', role=Role.VIEWER)
        self.admin = User.objects.create_user('acme-admin', password='secret', role=Role.VIEWER)
        self.manager = User.objects.create_user('acme-manager', password='secret', role=Role.EVENT_MANAGER)
        Membership.objects.create(organization=self.organization, user=self.owner, role=MembershipRole.OWNER)
        Membership.objects.create(organization=self.organization, user=self.admin, role=MembershipRole.ADMIN)
        Membership.objects.create(organization=self.organization, user=self.manager, role=MembershipRole.MANAGER)
        self.client = APIClient()

    def _as(self, user):
        self.client.force_authenticate(user)

    def test_owner_can_publish_rsvp_appearance(self):
        self._as(self.owner)

        response = self.client.patch(
            f'/api/events/{self.event.id}/rsvp-page/',
            {
                'rsvp_message': 'Welcome to the summit.',
                'rsvp_primary_color': '#112233',
                'rsvp_background_color': '#f6f4ee',
                'rsvp_card_color': '#ffffff',
                'rsvp_text_color': '#23262e',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.event.refresh_from_db()
        self.assertEqual(self.event.rsvp_message, 'Welcome to the summit.')
        self.assertEqual(self.event.rsvp_primary_color, '#112233')

    def test_admin_can_read_rsvp_appearance(self):
        self._as(self.admin)

        response = self.client.get(f'/api/events/{self.event.id}/rsvp-page/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], self.event.id)

    def test_event_manager_cannot_publish_rsvp_appearance(self):
        self._as(self.manager)

        response = self.client.patch(
            f'/api/events/{self.event.id}/rsvp-page/',
            {'rsvp_message': 'Not allowed'},
            format='json',
        )

        self.assertEqual(response.status_code, 403)

    def test_member_cannot_access_another_organizations_event(self):
        self._as(self.owner)

        response = self.client.get(f'/api/events/{self.other_event.id}/rsvp-page/')

        self.assertEqual(response.status_code, 404)
