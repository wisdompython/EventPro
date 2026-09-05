from django.test import TestCase
from rest_framework.test import APIClient

from .models import Membership, MembershipRole, Organization, User


class SignupTests(TestCase):
    payload = {
        'first_name': 'Amaka',
        'last_name': 'Okafor',
        'organization_name': 'Amaka Events Studio',
        'email': 'amaka@example.com',
        'password': 'A-Very-Strong!Password-912',
        'confirm_password': 'A-Very-Strong!Password-912',
        'timezone': 'Africa/Lagos',
        'accept_terms': True,
    }

    def csrf_client(self):
        client = APIClient(enforce_csrf_checks=True)
        response = client.get('/api/auth/csrf/')
        return client, response.cookies['csrftoken'].value

    def test_signup_creates_owner_workspace_and_authenticated_session(self):
        client, token = self.csrf_client()
        response = client.post(
            '/api/auth/signup/',
            self.payload,
            format='json',
            HTTP_X_CSRFTOKEN=token,
        )

        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email=self.payload['email'])
        organization = Organization.objects.get(name=self.payload['organization_name'])
        membership = Membership.objects.get(user=user, organization=organization)
        self.assertEqual(membership.role, MembershipRole.OWNER)
        self.assertEqual(response.data['active_organization']['id'], organization.id)
        self.assertEqual(response.data['membership_role'], MembershipRole.OWNER)
        self.assertFalse(response.data['is_platform_admin'])
        self.assertEqual(client.get('/api/auth/me/').status_code, 200)

    def test_signup_rejects_duplicate_email_case_insensitively(self):
        User.objects.create_user(username='existing', email='AMAKA@example.com')
        client, token = self.csrf_client()
        response = client.post(
            '/api/auth/signup/',
            self.payload,
            format='json',
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)

    def test_signup_rejects_password_mismatch(self):
        client, token = self.csrf_client()
        payload = {**self.payload, 'confirm_password': 'Different-Password!913'}
        response = client.post(
            '/api/auth/signup/',
            payload,
            format='json',
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('confirm_password', response.data)

    def test_signup_requires_csrf_token(self):
        client = APIClient(enforce_csrf_checks=True)
        response = client.post('/api/auth/signup/', self.payload, format='json')
        self.assertEqual(response.status_code, 403)

    def test_login_requires_csrf_token(self):
        User.objects.create_user(username='planner', password='Strong-Login!456')
        client = APIClient(enforce_csrf_checks=True)
        response = client.post(
            '/api/auth/login/',
            {'username': 'planner', 'password': 'Strong-Login!456'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
