from django.core.management.base import BaseCommand

from accounts.models import Organization
from public_sites.services import ensure_platform_domain


class Command(BaseCommand):
    help = 'Create the free platform subdomain for every organization that lacks one.'

    def handle(self, *args, **options):
        created = 0
        for organization in Organization.objects.filter(is_active=True).iterator():
            before = organization.domains.filter(type='platform_subdomain').exists()
            if ensure_platform_domain(organization) and not before:
                created += 1
        self.stdout.write(self.style.SUCCESS(f'{created} platform subdomain(s) created.'))
