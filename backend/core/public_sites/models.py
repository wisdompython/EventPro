import secrets

from django.conf import settings
from django.db import models
from django.db.models import Q


def generate_verification_token():
    return secrets.token_urlsafe(24)


class OrganizationDomain(models.Model):
    """A hostname that serves one organization's public pages.

    The domain belongs to the organization, not to an event: every public
    route (RSVP today; home page, event listing and check-in later) lives
    beneath whichever domains the organization has activated.
    """

    class Type(models.TextChoices):
        PLATFORM_SUBDOMAIN = 'platform_subdomain', 'Platform subdomain'
        CUSTOM_SUBDOMAIN = 'custom_subdomain', 'Custom subdomain'
        APEX_DOMAIN = 'apex_domain', 'Apex domain'

    class Status(models.TextChoices):
        # Waiting for the ownership TXT record.
        PENDING = 'pending', 'Pending verification'
        # Ownership proven; waiting for DNS to point at the platform.
        VERIFIED = 'verified', 'Verified'
        # Serving pages. Only active domains resolve to an organization.
        ACTIVE = 'active', 'Active'
        # Was verified or active, and a later check found the records gone.
        FAILED = 'failed', 'Failed'

    organization = models.ForeignKey(
        'accounts.Organization',
        on_delete=models.CASCADE,
        related_name='domains',
    )
    # Normalized: lowercase, ASCII (IDNA), no port, no trailing dot.
    hostname = models.CharField(max_length=253, unique=True)
    type = models.CharField(max_length=24, choices=Type.choices)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    verification_token = models.CharField(
        max_length=64,
        default=generate_verification_token,
        editable=False,
    )
    # The domain used when Event Pro generates guest links for the organization.
    is_primary = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    # The most recent check's explanation, shown to the admin as-is.
    last_check_message = models.CharField(max_length=500, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_primary', 'created_at', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['organization'],
                condition=Q(is_primary=True),
                name='one_primary_domain_per_organization',
            ),
            # A primary domain is used to build guest links, so it must serve.
            models.CheckConstraint(
                condition=Q(is_primary=False) | Q(status='active'),
                name='primary_domain_must_be_active',
            ),
        ]

    def __str__(self):
        return f'{self.hostname} · {self.organization} ({self.get_status_display()})'

    @property
    def is_platform(self) -> bool:
        return self.type == self.Type.PLATFORM_SUBDOMAIN

    @property
    def verification_record_name(self) -> str:
        return f'{settings.PUBLIC_SITE_VERIFICATION_PREFIX}.{self.hostname}'

    @property
    def verification_record_value(self) -> str:
        return f'eventpro-verify={self.verification_token}'
