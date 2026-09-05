from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Role, User


class CsrfEnforcementTests(TestCase):
    """Regression tests for the removal of CsrfExemptSessionAuthentication.

    The API previously disabled CSRF on every endpoint, so a logged-in user's
    session cookie was enough for any cross-site POST to succeed. These tests
    use enforce_csrf_checks=True, because the default APIClient skips CSRF and
    would pass either way.
    """

    def setUp(self):
        self.csrf_client = APIClient(enforce_csrf_checks=True)
        self.user = User.objects.create_user(
            'csrf-user', password='pass', role=Role.SUPER_ADMIN,
        )

    def test_session_authenticated_post_without_csrf_token_is_rejected(self):
        self.csrf_client.force_login(self.user)
        response = self.csrf_client.post('/api/events/', {'name': 'Should Fail'}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_csrf_endpoint_sets_cookie_and_allows_post(self):
        self.csrf_client.force_login(self.user)
        bootstrap = self.csrf_client.get('/api/auth/csrf/')
        self.assertEqual(bootstrap.status_code, 200)
        token = bootstrap.cookies['csrftoken'].value
        self.assertTrue(token)

        response = self.csrf_client.post(
            '/api/events/',
            {'name': 'CSRF OK', 'date': timezone.now().isoformat()},
            format='json',
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertNotEqual(response.status_code, 403)

    def test_public_rsvp_endpoint_does_not_require_csrf(self):
        """Token-authenticated public endpoints must stay reachable."""
        response = self.csrf_client.post(
            '/api/rsvp/respond/does-not-exist/', {'attending': True}, format='json',
        )
        self.assertNotEqual(response.status_code, 403)

    def test_exempt_auth_class_cannot_be_instantiated(self):
        from .permissions import CsrfExemptSessionAuthentication
        with self.assertRaises(RuntimeError):
            CsrfExemptSessionAuthentication()
