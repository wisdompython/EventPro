from urllib.parse import parse_qs, urlparse

from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Role, User


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    SITE_URL='http://localhost:3000',
)
class PasswordResetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='amaka',
            email='amaka@example.com',
            password='Original-Password!456',
            first_name='Amaka',
            role=Role.EVENT_MANAGER,
        )

    def request_link(self):
        response = self.client.post(
            '/api/auth/password/reset/',
            {'email': 'AMAKA@example.com'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(mail.outbox), 1)
        link = next(
            line for line in mail.outbox[0].body.splitlines()
            if line.startswith('http://localhost:3000/reset-password')
        )
        return parse_qs(urlparse(link).query)

    def test_known_email_receives_a_one_time_reset_link(self):
        query = self.request_link()
        response = self.client.post(
            '/api/auth/password/reset/confirm/',
            {
                'uid': query['uid'][0],
                'token': query['token'][0],
                'new_password': 'Replacement-Password!789',
                'confirm_password': 'Replacement-Password!789',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Replacement-Password!789'))

    def test_reset_link_cannot_be_reused_after_password_changes(self):
        query = self.request_link()
        payload = {
            'uid': query['uid'][0],
            'token': query['token'][0],
            'new_password': 'Replacement-Password!789',
            'confirm_password': 'Replacement-Password!789',
        }
        self.assertEqual(
            self.client.post('/api/auth/password/reset/confirm/', payload, format='json').status_code,
            200,
        )
        payload['new_password'] = payload['confirm_password'] = 'Another-Password!987'
        response = self.client.post('/api/auth/password/reset/confirm/', payload, format='json')
        self.assertEqual(response.status_code, 400)

    def test_unknown_email_gets_the_same_public_response(self):
        known = self.client.post(
            '/api/auth/password/reset/', {'email': self.user.email}, format='json',
        )
        mail.outbox.clear()
        unknown = self.client.post(
            '/api/auth/password/reset/', {'email': 'unknown@example.com'}, format='json',
        )
        self.assertEqual(unknown.status_code, 200)
        self.assertEqual(unknown.data, known.data)
        self.assertEqual(len(mail.outbox), 0)

    def test_invalid_token_does_not_change_password(self):
        response = self.client.post(
            '/api/auth/password/reset/confirm/',
            {
                'uid': 'invalid', 'token': 'invalid',
                'new_password': 'Replacement-Password!789',
                'confirm_password': 'Replacement-Password!789',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Original-Password!456'))

    def test_reset_request_requires_csrf(self):
        csrf_client = APIClient(enforce_csrf_checks=True)
        response = csrf_client.post(
            '/api/auth/password/reset/', {'email': self.user.email}, format='json',
        )
        self.assertEqual(response.status_code, 403)

        bootstrap = csrf_client.get('/api/auth/csrf/')
        token = bootstrap.cookies['csrftoken'].value
        response = csrf_client.post(
            '/api/auth/password/reset/',
            {'email': self.user.email},
            format='json',
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 200)


class PasswordChangeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='manager', email='manager@example.com',
            password='Original-Password!456', role=Role.EVENT_MANAGER,
        )
        self.client.force_login(self.user)

    def test_change_requires_the_current_password_and_preserves_session(self):
        response = self.client.post(
            '/api/auth/password/change/',
            {
                'current_password': 'Original-Password!456',
                'new_password': 'Replacement-Password!789',
                'confirm_password': 'Replacement-Password!789',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Replacement-Password!789'))
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)

    def test_wrong_current_password_is_rejected(self):
        response = self.client.post(
            '/api/auth/password/change/',
            {
                'current_password': 'Wrong-Password!123',
                'new_password': 'Replacement-Password!789',
                'confirm_password': 'Replacement-Password!789',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Original-Password!456'))

    def test_any_authenticated_role_can_update_its_own_profile(self):
        self.user.role = Role.VIEWER
        self.user.save(update_fields=['role'])
        response = self.client.patch(
            '/api/auth/me/',
            {'first_name': 'Tobi', 'last_name': 'Bello', 'email': 'tobi@example.com'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'tobi@example.com')
