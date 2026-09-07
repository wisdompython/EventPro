import json
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Membership, MembershipRole, Organization, Role, User

from .models import Event, Guest, SeatingSection, SeatingTable
from .serializers import BulkGuestUploadSerializer


class SeatingWorkflowTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='Seating Co', slug='seating-co')
        self.user = User.objects.create_user('seating-manager', password='pass', role=Role.EVENT_MANAGER)
        Membership.objects.create(user=self.user, organization=self.org, role=MembershipRole.MANAGER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        session = self.client.session
        session['active_organization_id'] = self.org.id
        session.save()

    def make_event(self):
        return Event.objects.create(
            organization=self.org,
            name='Reception',
            date=timezone.now() + timedelta(days=10),
            whatsapp_enabled=False,
        )

    def test_event_wizard_can_create_optional_seating_setup(self):
        response = self.client.post('/api/events/', {
            'name': 'Wedding reception',
            'date': (timezone.now() + timedelta(days=30)).isoformat(),
            'whatsapp_enabled': False,
            'seating_setup': json.dumps([
                {'name': 'High table', 'prefix': 'HT', 'table_count': 1, 'seats_per_table': 10, 'shape': 'rectangle', 'is_reserved': True},
                {'name': "Bride's side", 'prefix': 'BS', 'table_count': 2, 'seats_per_table': 8, 'shape': 'round'},
            ]),
        }, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        event = Event.objects.get(pk=response.data['id'])
        self.assertEqual(SeatingSection.objects.filter(event=event).count(), 2)
        self.assertEqual(list(SeatingTable.objects.filter(event=event).values_list('label', flat=True)), ['HT-01', 'BS-01', 'BS-02'])

    def test_event_wizard_can_skip_seating(self):
        response = self.client.post('/api/events/', {
            'name': 'No layout yet',
            'date': (timezone.now() + timedelta(days=30)).isoformat(),
            'whatsapp_enabled': False,
            'seating_setup': [],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(SeatingSection.objects.filter(event_id=response.data['id']).exists())

    def test_single_guest_can_auto_assign_from_area_or_table(self):
        event = self.make_event()
        section = SeatingSection.objects.create(event=event, name="Bride's side", prefix='BS')
        SeatingTable.objects.create(section=section, event=event, label='BS-01', seats=2)

        first = self.client.post('/api/guests/', {
            'event': event.id, 'full_name': 'Ada', 'seating_area': "Bride's side",
        }, format='json')
        second = self.client.post('/api/guests/', {
            'event': event.id, 'full_name': 'Ngozi', 'table_number': 'BS-01',
        }, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual((first.data['table_number'], first.data['seat_number']), ('BS-01', '1'))
        self.assertEqual((second.data['table_number'], second.data['seat_number']), ('BS-01', '2'))

    def test_csv_area_name_is_validated_and_auto_seated(self):
        event = self.make_event()
        section = SeatingSection.objects.create(event=event, name='Family & VIP', prefix='VIP')
        SeatingTable.objects.create(section=section, event=event, label='VIP-01', seats=4)
        csv_file = SimpleUploadedFile(
            'guests.csv',
            b'full_name,seating_area\nAda,Family & VIP\nNgozi,Family & VIP\n',
            content_type='text/csv',
        )
        serializer = BulkGuestUploadSerializer(data={'event': event.id, 'csv_file': csv_file})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        rows, errors = serializer.parse()
        self.assertEqual(errors, [])
        self.assertEqual([(row['table_number'], row['seat_number']) for row in rows], [('VIP-01', '1'), ('VIP-01', '2')])

    def test_guest_message_filters_support_area_table_and_seat_details(self):
        event = self.make_event()
        bride = SeatingSection.objects.create(event=event, name="Bride's side", prefix='BS')
        groom = SeatingSection.objects.create(event=event, name="Groom's side", prefix='GS')
        SeatingTable.objects.create(section=bride, event=event, label='BS-01', seats=8)
        SeatingTable.objects.create(section=groom, event=event, label='GS-01', seats=8)
        Guest.objects.create(event=event, full_name='Ada', phone_number='234800000001', table_number='BS-01', seat_number='3')
        Guest.objects.create(event=event, full_name='Emeka', phone_number='234800000002', table_number='GS-01', seat_number='6')
        Guest.objects.create(event=event, full_name='Unseated', phone_number='234800000003')

        area_response = self.client.get('/api/guests/', {'event': event.id, 'seating_area': "Bride's side"})
        table_response = self.client.get('/api/guests/', {'event': event.id, 'table_number': 'GS-01'})
        unseated_response = self.client.get('/api/guests/', {'event': event.id, 'table_number': '__unassigned__'})

        self.assertEqual([guest['full_name'] for guest in area_response.data['results']], ['Ada'])
        self.assertEqual(area_response.data['results'][0]['seat_number'], '3')
        self.assertEqual([guest['full_name'] for guest in table_response.data['results']], ['Emeka'])
        self.assertEqual([guest['full_name'] for guest in unseated_response.data['results']], ['Unseated'])
