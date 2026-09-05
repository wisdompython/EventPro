import os
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import Membership, MembershipRole, Organization, Role, User
from guests.models import Event


class Command(BaseCommand):
    help = 'Create the idempotent local Event Pro demo account and workspace.'

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('seed_demo is only available while DEBUG=True.')

        username = os.getenv('EVENT_PRO_DEMO_USERNAME', 'eventpro-demo')
        password = os.getenv('EVENT_PRO_DEMO_PASSWORD', 'eventpro123')
        email = os.getenv('EVENT_PRO_DEMO_EMAIL', 'admin@eventpro.local')

        user, _ = User.objects.get_or_create(
            username=username,
            defaults={
                'email': email,
                'first_name': 'Event Pro',
                'last_name': 'Admin',
            },
        )
        user.email = email
        user.role = Role.SUPER_ADMIN
        user.is_active = True
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()

        organization, _ = Organization.objects.get_or_create(
            slug='event-pro-demo',
            defaults={
                'name': 'Event Pro Demo',
                'timezone': os.getenv('APP_TIME_ZONE', 'Africa/Lagos'),
                'created_by': user,
            },
        )
        Membership.objects.update_or_create(
            organization=organization,
            user=user,
            defaults={'role': MembershipRole.OWNER, 'is_active': True},
        )

        Event.objects.get_or_create(
            organization=organization,
            name='Amina & Tobi Celebration',
            defaults={
                'date': timezone.now() + timedelta(days=45),
                'venue': 'The Grand Hall, Lagos',
                'description': 'A sample event for exploring the Event Pro workspace.',
            },
        )

        self.stdout.write(self.style.SUCCESS(
            f'Local demo ready: {username} / {password} ({organization.name})'
        ))
