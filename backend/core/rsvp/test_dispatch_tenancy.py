"""The RSVP dispatcher spends each organization's budget separately.

Before per-organization budgets, dispatch_scheduled_rsvp_messages counted every
recipient in the database against one global limit, so a workspace that had
exhausted its allowance stopped every other workspace's sends too.
"""
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.messaging_settings import clear_cache
from accounts.models import Organization, OrganizationMessagingSettings
from guests.models import Event, Guest, WhatsAppTemplate

from .models import RsvpRecipient, RsvpWorkflow


def make_template(organization, name):
    return WhatsAppTemplate.objects.create(
        organization=organization,
        name=name,
        display_name=name.replace('_', ' ').title(),
        body_text='{{1}}',
        body_params=['guest_name'],
    )


class RsvpDispatchTenancyTests(TestCase):
    def setUp(self):
        clear_cache()
        self.org_a = Organization.objects.create(
            name='Dispatch A', slug='dispatch-a', timezone='Africa/Lagos',
        )
        self.org_b = Organization.objects.create(
            name='Dispatch B', slug='dispatch-b', timezone='Africa/Lagos',
        )
        self.workflow_a = self._make_workflow(self.org_a, 'A')
        self.workflow_b = self._make_workflow(self.org_b, 'B')

    def tearDown(self):
        clear_cache()

    def _make_workflow(self, organization, tag):
        event = Event.objects.create(
            name=f'{tag} Gala',
            date=timezone.now() + timezone.timedelta(days=14),
            venue='Venue',
            organization=organization,
            whatsapp_enabled=True,
        )
        workflow = RsvpWorkflow.objects.create(
            event=event,
            invitation_template=make_template(organization, f'{tag.lower()}_invite'),
            pass_template=make_template(organization, f'{tag.lower()}_pass'),
            status=RsvpWorkflow.Status.ACTIVE,
        )
        for index in range(3):
            guest = Guest.objects.create(
                event=event,
                full_name=f'{tag} Guest {index}',
                phone_number=f'23480{tag and ord(tag) % 10}00000{index}',
            )
            RsvpRecipient.objects.create(
                workflow=workflow,
                guest=guest,
                invitation_status=RsvpRecipient.InvitationStatus.QUEUED,
                invitation_queued_at=None,
            )
        return workflow

    @override_settings(WHATSAPP_DAILY_SEND_LIMIT=3)
    @patch('rsvp.tasks.send_rsvp_invitation')
    def test_each_organization_gets_its_own_budget(self, mock_send):
        from .tasks import dispatch_scheduled_rsvp_messages

        result = dispatch_scheduled_rsvp_messages()

        # Three each, not three shared between them.
        self.assertEqual(result['invitations_queued'], 6)
        self.assertEqual(mock_send.delay.call_count, 6)

    @patch('rsvp.tasks.send_rsvp_invitation')
    def test_one_organization_at_its_cap_does_not_block_the_other(self, mock_send):
        from .tasks import dispatch_scheduled_rsvp_messages

        # Org A can send nothing more today; org B has its full allowance.
        OrganizationMessagingSettings.objects.create(
            organization=self.org_a, daily_send_limit=1,
        )
        Guest.objects.filter(event__organization=self.org_a).update(
            whatsapp_sent=True, whatsapp_sent_at=timezone.now(),
        )
        clear_cache()

        result = dispatch_scheduled_rsvp_messages()

        self.assertEqual(result['invitations_queued'], 3)
        dispatched_orgs = set(
            RsvpRecipient.objects
            .filter(invitation_queued_at__isnull=False)
            .values_list('workflow__event__organization_id', flat=True)
        )
        self.assertEqual(dispatched_orgs, {self.org_b.id})

    @patch('rsvp.tasks.send_rsvp_invitation')
    def test_reminder_policy_is_resolved_per_organization(self, mock_send):
        OrganizationMessagingSettings.objects.create(
            organization=self.org_a, rsvp_max_reminders=1,
        )
        clear_cache()

        from accounts.messaging_settings import messaging_settings_for

        self.assertEqual(
            messaging_settings_for(self.org_a.id).rsvp_max_reminders, 1,
        )
        self.assertEqual(
            messaging_settings_for(self.org_b.id).rsvp_max_reminders, 3,
        )
