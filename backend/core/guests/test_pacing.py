"""Tests for the per-organization in-task send throttle.

The Celery decorator's rate_limit is a global per-worker ceiling bound at
import time. These cover the half that *is* per-organization: the spacing
applied inside the send task.
"""
from django.test import TestCase

from accounts.messaging_settings import clear_cache
from accounts.models import Organization, OrganizationMessagingSettings

from . import pacing


class RecordingSleep:
    """Stand-in for time.sleep that records without actually waiting."""

    def __init__(self):
        self.calls = []

    def __call__(self, seconds):
        self.calls.append(seconds)


class SendPacingTests(TestCase):
    def setUp(self):
        clear_cache()
        pacing.reset()
        self.org_a = Organization.objects.create(
            name='Pace A', slug='pace-a', timezone='Africa/Lagos',
        )
        self.org_b = Organization.objects.create(
            name='Pace B', slug='pace-b', timezone='Africa/Lagos',
        )

    def tearDown(self):
        clear_cache()
        pacing.reset()

    def test_first_send_for_an_organization_does_not_wait(self):
        sleep = RecordingSleep()

        waited = pacing.pace_send(self.org_a.id, channel='whatsapp', sleep=sleep)

        self.assertEqual(waited, 0)
        self.assertEqual(sleep.calls, [])

    def test_second_send_waits_for_the_configured_spacing(self):
        OrganizationMessagingSettings.objects.create(
            organization=self.org_a, whatsapp_messages_per_minute=6,
        )
        clear_cache()
        sleep = RecordingSleep()

        pacing.pace_send(self.org_a.id, channel='whatsapp', sleep=sleep)
        waited = pacing.pace_send(self.org_a.id, channel='whatsapp', sleep=sleep)

        # 6 per minute means one every 10 seconds.
        self.assertAlmostEqual(waited, 10.0, places=1)
        self.assertEqual(len(sleep.calls), 1)

    def test_a_slower_organization_does_not_slow_another_one(self):
        OrganizationMessagingSettings.objects.create(
            organization=self.org_a, whatsapp_messages_per_minute=2,
        )
        clear_cache()
        sleep = RecordingSleep()

        pacing.pace_send(self.org_a.id, channel='whatsapp', sleep=sleep)
        pacing.pace_send(self.org_a.id, channel='whatsapp', sleep=sleep)
        waited_b = pacing.pace_send(self.org_b.id, channel='whatsapp', sleep=sleep)

        self.assertEqual(waited_b, 0)

    def test_channels_are_paced_independently(self):
        sleep = RecordingSleep()

        pacing.pace_send(self.org_a.id, channel='whatsapp', sleep=sleep)
        waited = pacing.pace_send(self.org_a.id, channel='rsvp', sleep=sleep)

        self.assertEqual(waited, 0)

    def test_rsvp_channel_uses_the_rsvp_pace(self):
        OrganizationMessagingSettings.objects.create(
            organization=self.org_a,
            rsvp_messages_per_minute=4,
            whatsapp_messages_per_minute=20,
        )
        clear_cache()
        sleep = RecordingSleep()

        pacing.pace_send(self.org_a.id, channel='rsvp', sleep=sleep)
        waited = pacing.pace_send(self.org_a.id, channel='rsvp', sleep=sleep)

        self.assertAlmostEqual(waited, 15.0, places=1)

    def test_spacing_is_capped_so_a_bad_value_cannot_hang_a_worker(self):
        sleep = RecordingSleep()

        pacing.pace_send(None, channel='whatsapp', sleep=sleep)
        # A zero/absent pace falls back to the cap, not an unbounded wait.
        self.assertLessEqual(pacing._spacing_seconds(0), pacing.MAX_SPACING_SECONDS)
        self.assertLessEqual(pacing._spacing_seconds(-5), pacing.MAX_SPACING_SECONDS)
