"""Tests for per-organization messaging settings.

Covers what the prompt named as the risk surface: tenant isolation, role
enforcement, validation bounds, fallback to the platform default when no row
exists, and the correctness bug this work fixes — a send budget that used to
be counted globally across every tenant.
"""
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .messaging_settings import clear_cache, messaging_settings_for
from .models import (
    Membership,
    MembershipRole,
    MessagingSettingsAuditLog,
    Organization,
    OrganizationMessagingSettings,
    Role,
    User,
)

SETTINGS_URL = '/api/auth/messaging-settings/'
AUDIT_URL = '/api/auth/messaging-settings/audit/'


def make_organization(name, slug):
    return Organization.objects.create(name=name, slug=slug, timezone='Africa/Lagos')


def make_member(organization, username, role, legacy_role=Role.SUPER_ADMIN):
    user = User.objects.create_user(username, password='pass', role=legacy_role)
    Membership.objects.create(organization=organization, user=user, role=role)
    return user


class MessagingSettingsResolverTests(TestCase):
    """The resolver is what every consumer reads through."""

    def setUp(self):
        clear_cache()
        self.organization = make_organization('Resolver Co', 'resolver-co')

    def tearDown(self):
        clear_cache()

    def test_falls_back_to_platform_defaults_when_no_row_exists(self):
        resolved = messaging_settings_for(self.organization.id)

        self.assertEqual(resolved.daily_send_limit, 2000)
        self.assertEqual(resolved.rsvp_max_reminders, 3)
        self.assertEqual(resolved.rsvp_reminder_cooldown_minutes, 360)
        self.assertEqual(resolved.source_for('daily_send_limit'), 'platform')

    @override_settings(WHATSAPP_DAILY_SEND_LIMIT=750)
    def test_changed_platform_default_propagates_to_rows_that_did_not_override(self):
        """Defaults are not copied into the row, so raising one must propagate."""
        OrganizationMessagingSettings.objects.create(
            organization=self.organization,
            rsvp_max_reminders=2,
        )
        clear_cache()

        resolved = messaging_settings_for(self.organization.id)

        self.assertEqual(resolved.daily_send_limit, 750)
        self.assertEqual(resolved.source_for('daily_send_limit'), 'platform')
        self.assertEqual(resolved.rsvp_max_reminders, 2)
        self.assertEqual(resolved.source_for('rsvp_max_reminders'), 'organization')

    def test_organization_override_wins(self):
        OrganizationMessagingSettings.objects.create(
            organization=self.organization,
            daily_send_limit=500,
        )
        clear_cache()

        resolved = messaging_settings_for(self.organization.id)

        self.assertEqual(resolved.daily_send_limit, 500)
        self.assertEqual(resolved.source_for('daily_send_limit'), 'organization')

    @override_settings(WHATSAPP_DAILY_SEND_LIMIT_CEILING=1000)
    def test_stored_value_is_clamped_to_a_ceiling_lowered_since_it_was_saved(self):
        OrganizationMessagingSettings.objects.create(
            organization=self.organization,
            daily_send_limit=90000,
        )
        clear_cache()

        self.assertEqual(messaging_settings_for(self.organization.id).daily_send_limit, 1000)

    def test_empty_backoff_schedule_never_reaches_retry_delay_for(self):
        """An empty list would IndexError in retry_delay_for() on a real send."""
        OrganizationMessagingSettings.objects.create(
            organization=self.organization,
            failed_send_retry_delay_hours=[],
            ecosystem_retry_delay_hours=[],
        )
        clear_cache()

        resolved = messaging_settings_for(self.organization.id)

        self.assertEqual(resolved.failed_send_retry_delay_hours, (1, 4, 12))
        self.assertEqual(resolved.ecosystem_retry_delay_hours, (24, 24, 24))

    def test_malformed_backoff_entries_are_discarded(self):
        OrganizationMessagingSettings.objects.create(
            organization=self.organization,
            failed_send_retry_delay_hours=[2, 'x', 0, -5, 6],
        )
        clear_cache()

        resolved = messaging_settings_for(self.organization.id)

        self.assertEqual(resolved.failed_send_retry_delay_hours, (2, 6))


class MessagingSettingsApiTests(TestCase):
    def setUp(self):
        clear_cache()
        self.organization = make_organization('Api Co', 'api-co')
        self.other = make_organization('Other Co', 'other-co')
        self.owner = make_member(self.organization, 'owner-user', MembershipRole.OWNER)
        self.client = APIClient()
        self.client.force_login(self.owner)

    def tearDown(self):
        clear_cache()

    def test_get_returns_defaults_and_their_source_when_no_row_exists(self):
        response = self.client.get(SETTINGS_URL)

        self.assertEqual(response.status_code, 200)
        daily = response.data['fields']['daily_send_limit']
        self.assertEqual(daily['value'], 2000)
        self.assertEqual(daily['default'], 2000)
        self.assertIsNone(daily['override'])
        self.assertEqual(daily['source'], 'platform')

    def test_patch_stores_an_override_and_reports_it_as_such(self):
        response = self.client.patch(
            SETTINGS_URL, {'daily_send_limit': 1200}, format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        daily = response.data['fields']['daily_send_limit']
        self.assertEqual(daily['value'], 1200)
        self.assertEqual(daily['override'], 1200)
        self.assertEqual(daily['source'], 'organization')
        self.assertEqual(
            messaging_settings_for(self.organization.id).daily_send_limit, 1200,
        )

    def test_null_clears_the_override_back_to_the_platform_default(self):
        self.client.patch(SETTINGS_URL, {'daily_send_limit': 1200}, format='json')

        response = self.client.patch(
            SETTINGS_URL, {'daily_send_limit': None}, format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        daily = response.data['fields']['daily_send_limit']
        self.assertEqual(daily['value'], 2000)
        self.assertIsNone(daily['override'])
        self.assertEqual(daily['source'], 'platform')

    def test_patch_only_touches_submitted_fields(self):
        self.client.patch(SETTINGS_URL, {'rsvp_max_reminders': 2}, format='json')

        response = self.client.patch(
            SETTINGS_URL, {'daily_send_limit': 900}, format='json',
        )

        self.assertEqual(response.data['fields']['rsvp_max_reminders']['override'], 2)
        self.assertEqual(response.data['fields']['daily_send_limit']['override'], 900)

    def test_worker_rate_limit_is_reported_read_only_with_its_restart_caveat(self):
        response = self.client.get(SETTINGS_URL)

        rate = response.data['worker_rate_limit']
        self.assertTrue(rate['requires_worker_restart'])
        self.assertEqual(rate['per_worker_per_minute'], 20)


class MessagingSettingsValidationTests(TestCase):
    def setUp(self):
        clear_cache()
        self.organization = make_organization('Bounds Co', 'bounds-co')
        self.owner = make_member(self.organization, 'bounds-owner', MembershipRole.OWNER)
        self.client = APIClient()
        self.client.force_login(self.owner)

    def tearDown(self):
        clear_cache()

    def test_daily_limit_above_the_platform_ceiling_is_rejected(self):
        response = self.client.patch(
            SETTINGS_URL, {'daily_send_limit': 500000}, format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('daily_send_limit', response.data)

    def test_reminder_cooldown_below_the_floor_is_rejected(self):
        response = self.client.patch(
            SETTINGS_URL, {'rsvp_reminder_cooldown_minutes': 5}, format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('rsvp_reminder_cooldown_minutes', response.data)

    def test_zero_reminder_cooldown_is_rejected(self):
        response = self.client.patch(
            SETTINGS_URL, {'rsvp_reminder_cooldown_minutes': 0}, format='json',
        )

        self.assertEqual(response.status_code, 400)

    def test_max_reminders_above_the_cap_is_rejected(self):
        response = self.client.patch(
            SETTINGS_URL, {'rsvp_max_reminders': 20}, format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('rsvp_max_reminders', response.data)

    def test_zero_daily_send_limit_is_rejected(self):
        response = self.client.patch(
            SETTINGS_URL, {'daily_send_limit': 0}, format='json',
        )

        self.assertEqual(response.status_code, 400)

    def test_negative_values_are_rejected(self):
        response = self.client.patch(
            SETTINGS_URL, {'rsvp_max_reminders': -1}, format='json',
        )

        self.assertEqual(response.status_code, 400)

    def test_empty_backoff_schedule_is_rejected(self):
        response = self.client.patch(
            SETTINGS_URL, {'failed_send_retry_delay_hours': []}, format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('failed_send_retry_delay_hours', response.data)

    def test_backoff_schedule_with_a_zero_wait_is_rejected(self):
        response = self.client.patch(
            SETTINGS_URL, {'failed_send_retry_delay_hours': [1, 0, 4]}, format='json',
        )

        self.assertEqual(response.status_code, 400)

    def test_messages_per_minute_above_the_worker_ceiling_is_rejected(self):
        response = self.client.patch(
            SETTINGS_URL, {'rsvp_messages_per_minute': 500}, format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('rsvp_messages_per_minute', response.data)

    def test_a_valid_backoff_schedule_is_accepted(self):
        response = self.client.patch(
            SETTINGS_URL, {'failed_send_retry_delay_hours': [2, 6, 18]}, format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            response.data['fields']['failed_send_retry_delay_hours']['value'],
            [2, 6, 18],
        )


class MessagingSettingsTenancyTests(TestCase):
    """Org A must not be able to read or write org B's settings."""

    def setUp(self):
        clear_cache()
        self.org_a = make_organization('Tenant A', 'tenant-a')
        self.org_b = make_organization('Tenant B', 'tenant-b')
        self.owner_a = make_member(self.org_a, 'owner-a', MembershipRole.OWNER)
        OrganizationMessagingSettings.objects.create(
            organization=self.org_b, daily_send_limit=4321,
        )
        self.client = APIClient()
        self.client.force_login(self.owner_a)

    def tearDown(self):
        clear_cache()

    def test_read_returns_only_the_callers_own_organization(self):
        response = self.client.get(SETTINGS_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['organization'], self.org_a.id)
        self.assertNotEqual(response.data['fields']['daily_send_limit']['value'], 4321)

    def test_a_supplied_organization_id_in_the_body_is_ignored(self):
        response = self.client.patch(
            SETTINGS_URL,
            {'organization': self.org_b.id, 'daily_send_limit': 999},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['organization'], self.org_a.id)
        # Org B's row is untouched.
        self.assertEqual(
            OrganizationMessagingSettings.objects.get(
                organization=self.org_b,
            ).daily_send_limit,
            4321,
        )

    def test_audit_log_shows_only_the_callers_organization(self):
        MessagingSettingsAuditLog.objects.create(
            organization=self.org_b, field='daily_send_limit',
            old_value='2000', new_value='4321',
        )
        self.client.patch(SETTINGS_URL, {'daily_send_limit': 800}, format='json')

        response = self.client.get(AUDIT_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['new_value'], '800')


class MessagingSettingsRoleTests(TestCase):
    """Only owner and admin may write; everyone else reads."""

    def setUp(self):
        clear_cache()
        self.organization = make_organization('Roles Co', 'roles-co')

    def tearDown(self):
        clear_cache()

    def _client_for(self, role, username, legacy_role=Role.VIEWER):
        user = make_member(self.organization, username, role, legacy_role=legacy_role)
        client = APIClient()
        client.force_login(user)
        return client

    def test_owner_may_write(self):
        client = self._client_for(MembershipRole.OWNER, 'role-owner')

        response = client.patch(SETTINGS_URL, {'daily_send_limit': 1500}, format='json')

        self.assertEqual(response.status_code, 200, response.data)

    def test_admin_may_write(self):
        client = self._client_for(MembershipRole.ADMIN, 'role-admin')

        response = client.patch(SETTINGS_URL, {'daily_send_limit': 1500}, format='json')

        self.assertEqual(response.status_code, 200, response.data)

    def test_manager_may_read_but_not_write(self):
        client = self._client_for(MembershipRole.MANAGER, 'role-manager')

        self.assertEqual(client.get(SETTINGS_URL).status_code, 200)
        write = client.patch(SETTINGS_URL, {'daily_send_limit': 1500}, format='json')
        self.assertEqual(write.status_code, 403)

    def test_viewer_may_read_but_not_write(self):
        client = self._client_for(MembershipRole.VIEWER, 'role-viewer')

        self.assertEqual(client.get(SETTINGS_URL).status_code, 200)
        write = client.patch(SETTINGS_URL, {'daily_send_limit': 1500}, format='json')
        self.assertEqual(write.status_code, 403)

    def test_check_in_staff_may_not_write(self):
        client = self._client_for(MembershipRole.CHECK_IN, 'role-checkin')

        write = client.patch(SETTINGS_URL, {'daily_send_limit': 1500}, format='json')

        self.assertEqual(write.status_code, 403)

    def test_anonymous_is_rejected(self):
        response = APIClient().get(SETTINGS_URL)

        self.assertIn(response.status_code, (401, 403))


class MessagingSettingsAuditTrailTests(TestCase):
    def setUp(self):
        clear_cache()
        self.organization = make_organization('Audit Co', 'audit-co')
        self.owner = make_member(self.organization, 'audit-owner', MembershipRole.OWNER)
        self.client = APIClient()
        self.client.force_login(self.owner)

    def tearDown(self):
        clear_cache()

    def test_a_change_records_who_what_from_and_to(self):
        self.client.patch(SETTINGS_URL, {'daily_send_limit': 10000}, format='json')

        entry = MessagingSettingsAuditLog.objects.get(field='daily_send_limit')

        self.assertEqual(entry.old_value, 'platform default')
        self.assertEqual(entry.new_value, '10000')
        self.assertEqual(entry.changed_by, self.owner)
        self.assertEqual(entry.organization, self.organization)

    def test_reverting_to_the_default_is_recorded(self):
        self.client.patch(SETTINGS_URL, {'daily_send_limit': 10000}, format='json')
        self.client.patch(SETTINGS_URL, {'daily_send_limit': None}, format='json')

        entries = list(
            MessagingSettingsAuditLog.objects
            .filter(field='daily_send_limit').order_by('id')
        )

        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[1].old_value, '10000')
        self.assertEqual(entries[1].new_value, 'platform default')

    def test_an_unchanged_value_is_not_logged(self):
        self.client.patch(SETTINGS_URL, {'daily_send_limit': 900}, format='json')
        self.client.patch(SETTINGS_URL, {'daily_send_limit': 900}, format='json')

        self.assertEqual(
            MessagingSettingsAuditLog.objects.filter(field='daily_send_limit').count(),
            1,
        )

    def test_a_rejected_change_leaves_no_audit_entry(self):
        self.client.patch(SETTINGS_URL, {'daily_send_limit': 500000}, format='json')

        self.assertFalse(MessagingSettingsAuditLog.objects.exists())
