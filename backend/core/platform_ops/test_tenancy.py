"""Cross-app tenancy tests.

These exercise organisation scoping across the accounts/guests boundary, so
they live in platform_ops — the one app allowed to read from several others.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from guests.models import Event

from accounts.models import Membership, MembershipRole, Organization, Role, User


class OrganizationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='planner',
            email='planner@example.com',
            password='strong-password',
            role=Role.SUPER_ADMIN,
        )
        self.alpha = Organization.objects.create(name='Alpha Events', slug='alpha-events')
        self.beta = Organization.objects.create(name='Beta Events', slug='beta-events')
        Membership.objects.create(
            organization=self.alpha,
            user=self.user,
            role=MembershipRole.OWNER,
        )
        Membership.objects.create(
            organization=self.beta,
            user=self.user,
            role=MembershipRole.MANAGER,
        )
        self.client.force_login(self.user)

    def test_me_includes_active_organization_and_memberships(self):
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['active_organization']['id'], self.alpha.id)
        self.assertEqual(
            {organization['id'] for organization in response.data['organizations']},
            {self.alpha.id, self.beta.id},
        )
        self.assertEqual(response.data['membership_role'], MembershipRole.OWNER)

    def test_user_can_switch_to_an_organization_they_belong_to(self):
        response = self.client.post(f'/api/auth/organizations/{self.beta.id}/activate/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['active_organization']['id'], self.beta.id)
        self.assertEqual(self.client.get('/api/auth/me/').data['membership_role'], MembershipRole.MANAGER)

    def test_user_cannot_activate_an_unrelated_organization(self):
        outsider = Organization.objects.create(name='Outside', slug='outside')
        response = self.client.post(f'/api/auth/organizations/{outsider.id}/activate/')
        self.assertEqual(response.status_code, 404)

    def test_creating_an_organization_makes_the_user_its_owner(self):
        response = self.client.post(
            '/api/auth/organizations/',
            {'name': 'New Company', 'timezone': 'Africa/Lagos'},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        organization = Organization.objects.get(pk=response.data['id'])
        membership = Membership.objects.get(organization=organization, user=self.user)
        self.assertEqual(membership.role, MembershipRole.OWNER)
        self.assertEqual(self.client.get('/api/auth/me/').data['active_organization']['id'], organization.id)


class TenantIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='owner',
            password='strong-password',
            role=Role.SUPER_ADMIN,
        )
        self.alpha = Organization.objects.create(name='Alpha Events', slug='tenant-alpha')
        self.beta = Organization.objects.create(name='Beta Events', slug='tenant-beta')
        Membership.objects.create(
            organization=self.alpha,
            user=self.user,
            role=MembershipRole.OWNER,
        )
        self.alpha_event = Event.objects.create(
            organization=self.alpha,
            name='Alpha Gala',
            date=timezone.now() + timedelta(days=30),
            whatsapp_enabled=False,
        )
        self.beta_event = Event.objects.create(
            organization=self.beta,
            name='Beta Gala',
            date=timezone.now() + timedelta(days=40),
            whatsapp_enabled=False,
        )
        self.client.force_login(self.user)

    def test_event_list_only_contains_the_active_organization(self):
        response = self.client.get('/api/events/')
        self.assertEqual(response.status_code, 200)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual([row['id'] for row in rows], [self.alpha_event.id])

    def test_cross_tenant_event_detail_is_not_found(self):
        response = self.client.get(f'/api/events/{self.beta_event.id}/')
        self.assertEqual(response.status_code, 404)

    def test_event_creation_uses_active_organization(self):
        response = self.client.post(
            '/api/events/',
            {
                'name': 'New Alpha Event',
                'date': (timezone.now() + timedelta(days=50)).isoformat(),
                'whatsapp_enabled': False,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Event.objects.get(pk=response.data['id']).organization_id, self.alpha.id)

    def test_guest_cannot_be_created_for_another_organization_event(self):
        response = self.client.post(
            '/api/guests/',
            {
                'event': self.beta_event.id,
                'full_name': 'Cross Tenant Guest',
                'ticket_type': 'general',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('event', response.data)
