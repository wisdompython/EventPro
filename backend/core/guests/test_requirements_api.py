"""API tests for the requirement builder (Phase 2).

Covers tenancy isolation, the kind-specific validation rules, and reorder.
"""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Membership, MembershipRole, Organization, Role, User

from .models import Event, GuestRequirement


class RequirementApiTestCase(TestCase):
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
        self.other_requirement = GuestRequirement.objects.create(
            event=self.other_event, key='secret', label='Secret Question',
            kind=GuestRequirement.Kind.TEXT,
        )

        self.client.force_authenticate(self.user)
        session = self.client.session
        session['active_organization_id'] = self.org.id
        session.save()


class RequirementCrudTests(RequirementApiTestCase):
    def test_create_a_quantity_requirement(self):
        response = self.client.post('/api/requirements/', {
            'event': self.event.id, 'key': 'aso_ebi', 'label': 'Aso Ebi',
            'kind': 'quantity', 'unit': 'yards', 'applies_to': 'primary',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['unit'], 'yards')
        self.assertEqual(response.data['response_count'], 0)

    def test_choice_requires_options(self):
        response = self.client.post('/api/requirements/', {
            'event': self.event.id, 'key': 'meal', 'label': 'Meal',
            'kind': 'choice', 'options': [],
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('options', response.data)

    def test_options_rejected_on_non_choice_kinds(self):
        response = self.client.post('/api/requirements/', {
            'event': self.event.id, 'key': 'note', 'label': 'Note',
            'kind': 'text', 'options': ['A', 'B'],
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('options', response.data)

    def test_unit_rejected_on_non_quantity_kinds(self):
        response = self.client.post('/api/requirements/', {
            'event': self.event.id, 'key': 'shuttle', 'label': 'Shuttle',
            'kind': 'boolean', 'unit': 'yards',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('unit', response.data)

    def test_duplicate_options_are_rejected(self):
        response = self.client.post('/api/requirements/', {
            'event': self.event.id, 'key': 'meal', 'label': 'Meal',
            'kind': 'choice', 'options': ['Fish', 'Fish'],
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('options', response.data)

    def test_blank_options_are_stripped(self):
        response = self.client.post('/api/requirements/', {
            'event': self.event.id, 'key': 'meal', 'label': 'Meal',
            'kind': 'choice', 'options': ['Fish', '  ', '', ' Beef '],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['options'], ['Fish', 'Beef'])

    def test_duplicate_key_on_the_same_event_is_rejected(self):
        payload = {
            'event': self.event.id, 'key': 'meal', 'label': 'Meal',
            'kind': 'choice', 'options': ['Fish'],
        }
        self.assertEqual(self.client.post('/api/requirements/', payload, format='json').status_code, 201)
        self.assertEqual(self.client.post('/api/requirements/', payload, format='json').status_code, 400)

    def test_presets_are_listed(self):
        response = self.client.get('/api/requirements/presets/')
        self.assertEqual(response.status_code, 200)
        keys = [preset['key'] for preset in response.data]
        self.assertIn('aso_ebi', keys)
        self.assertIn('meal_choice', keys)
        # Fabric is per invitation; a meal is per person.
        presets = {preset['key']: preset for preset in response.data}
        self.assertEqual(presets['aso_ebi']['applies_to'], 'primary')
        self.assertEqual(presets['meal_choice']['applies_to'], 'everyone')


class RequirementTenancyTests(RequirementApiTestCase):
    """An id from another organisation must be unreachable by every route."""

    def test_list_excludes_other_organizations(self):
        GuestRequirement.objects.create(
            event=self.event, key='mine', label='Mine',
            kind=GuestRequirement.Kind.TEXT,
        )
        response = self.client.get('/api/requirements/')
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        ids = [item['id'] for item in results]
        self.assertIn(GuestRequirement.objects.get(key='mine').id, ids)
        self.assertNotIn(self.other_requirement.id, ids)

    def test_retrieve_other_organization_requirement_is_404(self):
        response = self.client.get(f'/api/requirements/{self.other_requirement.id}/')
        self.assertEqual(response.status_code, 404)

    def test_update_other_organization_requirement_is_404(self):
        response = self.client.patch(
            f'/api/requirements/{self.other_requirement.id}/',
            {'label': 'Hijacked'}, format='json',
        )
        self.assertEqual(response.status_code, 404)
        self.other_requirement.refresh_from_db()
        self.assertEqual(self.other_requirement.label, 'Secret Question')

    def test_delete_other_organization_requirement_is_404(self):
        response = self.client.delete(f'/api/requirements/{self.other_requirement.id}/')
        self.assertEqual(response.status_code, 404)
        self.assertTrue(GuestRequirement.objects.filter(pk=self.other_requirement.pk).exists())

    def test_cannot_attach_a_requirement_to_another_organizations_event(self):
        response = self.client.post('/api/requirements/', {
            'event': self.other_event.id, 'key': 'injected', 'label': 'Injected',
            'kind': 'text',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('event', response.data)
        self.assertFalse(
            GuestRequirement.objects.filter(event=self.other_event, key='injected').exists(),
        )

    def test_cannot_reorder_another_organizations_event(self):
        response = self.client.post('/api/requirements/reorder/', {
            'event': self.other_event.id, 'order': [self.other_requirement.id],
        }, format='json')
        self.assertEqual(response.status_code, 404)


class RequirementReorderTests(RequirementApiTestCase):
    def test_reorder_writes_positions(self):
        first = GuestRequirement.objects.create(
            event=self.event, key='a', label='A', kind=GuestRequirement.Kind.TEXT, position=0,
        )
        second = GuestRequirement.objects.create(
            event=self.event, key='b', label='B', kind=GuestRequirement.Kind.TEXT, position=1,
        )
        response = self.client.post('/api/requirements/reorder/', {
            'event': self.event.id, 'order': [second.id, first.id],
        }, format='json')
        self.assertEqual(response.status_code, 200)

        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(second.position, 0)
        self.assertEqual(first.position, 1)

    def test_reorder_ignores_ids_outside_the_event(self):
        mine = GuestRequirement.objects.create(
            event=self.event, key='a', label='A', kind=GuestRequirement.Kind.TEXT, position=0,
        )
        response = self.client.post('/api/requirements/reorder/', {
            'event': self.event.id, 'order': [self.other_requirement.id, mine.id],
        }, format='json')
        self.assertEqual(response.status_code, 200)

        # The foreign requirement keeps its position; ours moves to index 1.
        self.other_requirement.refresh_from_db()
        mine.refresh_from_db()
        self.assertEqual(self.other_requirement.position, 0)
        self.assertEqual(mine.position, 1)

    def test_reorder_requires_an_order_list(self):
        response = self.client.post('/api/requirements/reorder/', {
            'event': self.event.id,
        }, format='json')
        self.assertEqual(response.status_code, 400)
