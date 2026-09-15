"""Cross-app behaviour of per-organization messaging settings.

These live in platform_ops because they read across accounts, guests and rsvp
together. accounts must not import the domain apps (see
guests.test_boundaries.AppDependencyTests), so the settings tests that stay
inside accounts cover only the resolver and the API.

The behaviour under test is the correctness fix in this work: the daily send
budget used to be counted globally across every tenant, so one workspace's
sends consumed every other workspace's allowance.
"""
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.messaging_settings import clear_cache, messaging_settings_for
from accounts.models import Organization, OrganizationMessagingSettings
from guests.models import Event, Guest
from guests.send_budget import remaining_send_budget


def make_organization(name, slug):
    return Organization.objects.create(name=name, slug=slug, timezone='Africa/Lagos')


class SendBudgetTenancyTests(TestCase):
    """The budget used to be counted globally — one tenant drained another's."""

    def setUp(self):
        clear_cache()
        self.org_a = make_organization('Alpha Events', 'alpha-events')
        self.org_b = make_organization('Beta Events', 'beta-events')
        self.event_a = Event.objects.create(
            name='Alpha Gala', date=timezone.now() + timezone.timedelta(days=7),
            organization=self.org_a,
        )
        self.event_b = Event.objects.create(
            name='Beta Dinner', date=timezone.now() + timezone.timedelta(days=7),
            organization=self.org_b,
        )

    def tearDown(self):
        clear_cache()

    @override_settings(WHATSAPP_DAILY_SEND_LIMIT=10)
    def test_one_tenants_sends_do_not_consume_another_tenants_budget(self):
        now = timezone.now()
        for index in range(6):
            Guest.objects.create(
                event=self.event_a,
                full_name=f'Alpha Guest {index}',
                phone_number=f'23480000000{index}',
                whatsapp_sent=True,
                whatsapp_sent_at=now,
            )

        self.assertEqual(remaining_send_budget(now, self.org_a.id), 4)
        # Org B has sent nothing; its full tier must still be available.
        self.assertEqual(remaining_send_budget(now, self.org_b.id), 10)

    def test_each_organization_gets_its_own_limit(self):
        OrganizationMessagingSettings.objects.create(
            organization=self.org_a, daily_send_limit=50,
        )
        OrganizationMessagingSettings.objects.create(
            organization=self.org_b, daily_send_limit=5000,
        )
        clear_cache()
        now = timezone.now()

        self.assertEqual(remaining_send_budget(now, self.org_a.id), 50)
        self.assertEqual(remaining_send_budget(now, self.org_b.id), 5000)

    @override_settings(WHATSAPP_DAILY_SEND_LIMIT=10)
    def test_reminder_logs_and_recipients_are_scoped_by_their_owning_event(self):
        """Guest/RsvpRecipient/ReminderLog have no organization column.

        The scope is applied by traversing the event that owns each row, so a
        regression in those lookup paths would silently restore the global
        count this test exists to prevent.
        """
        now = timezone.now()
        Guest.objects.create(
            event=self.event_b, full_name='Beta Guest',
            phone_number='2348111111111',
            whatsapp_sent=True, whatsapp_sent_at=now,
        )

        self.assertEqual(remaining_send_budget(now, self.org_a.id), 10)
        self.assertEqual(remaining_send_budget(now, self.org_b.id), 9)


class RetryScheduleTests(TestCase):
    """retry_delay_for() indexes the schedule, so it must never be empty."""

    def setUp(self):
        clear_cache()
        self.organization = make_organization('Retry Co', 'retry-co')

    def tearDown(self):
        clear_cache()

    def test_retry_delay_for_uses_the_organizations_schedule(self):
        from rsvp.tasks import retry_delay_for

        OrganizationMessagingSettings.objects.create(
            organization=self.organization,
            failed_send_retry_delay_hours=[2, 8],
        )
        clear_cache()

        first = retry_delay_for('rate limit', 0, self.organization.id)
        second = retry_delay_for('rate limit', 1, self.organization.id)
        # Past the end of the schedule the last entry repeats — no IndexError.
        beyond = retry_delay_for('rate limit', 9, self.organization.id)

        self.assertEqual(first, timezone.timedelta(hours=2))
        self.assertEqual(second, timezone.timedelta(hours=8))
        self.assertEqual(beyond, timezone.timedelta(hours=8))

    def test_an_empty_stored_schedule_does_not_raise_on_a_real_send(self):
        from rsvp.tasks import retry_delay_for

        OrganizationMessagingSettings.objects.create(
            organization=self.organization,
            failed_send_retry_delay_hours=[],
            ecosystem_retry_delay_hours=[],
        )
        clear_cache()

        self.assertEqual(
            retry_delay_for('rate limit', 0, self.organization.id),
            timezone.timedelta(hours=1),
        )
        self.assertEqual(
            retry_delay_for('131049 healthy ecosystem', 5, self.organization.id),
            timezone.timedelta(hours=24),
        )

    def test_ecosystem_errors_use_the_ecosystem_schedule(self):
        from rsvp.tasks import retry_delay_for

        OrganizationMessagingSettings.objects.create(
            organization=self.organization,
            failed_send_retry_delay_hours=[1],
            ecosystem_retry_delay_hours=[36],
        )
        clear_cache()

        self.assertEqual(
            retry_delay_for('Meta chose not to deliver', 0, self.organization.id),
            timezone.timedelta(hours=36),
        )
        self.assertEqual(
            retry_delay_for('rate limit', 0, self.organization.id),
            timezone.timedelta(hours=1),
        )
