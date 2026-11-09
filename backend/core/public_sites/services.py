"""Organization domains: resolution, verification and public link building.

Request flow for a branded page::

    Host header → active OrganizationDomain → Organization → scoped queries

Only ACTIVE domains resolve. Everything a public site view reads must be
filtered by the organization returned here, never by a client-supplied id.
"""
import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare

from . import dns_lookup
from .hostnames import platform_hostname_for, strip_port
from .models import OrganizationDomain

logger = logging.getLogger(__name__)

Status = OrganizationDomain.Status
Type = OrganizationDomain.Type

SITE_HOST_HEADER = 'HTTP_X_EVENT_PRO_SITE_HOST'
PROXY_SECRET_HEADER = 'HTTP_X_EVENT_PRO_PROXY_SECRET'


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------

def site_host_from_request(request) -> str:
    """The public hostname a request was made to.

    Branded pages reach the API through the Next.js proxy, which forwards the
    visitor's Host as ``X-Event-Pro-Site-Host``. With a proxy secret
    configured, the header is honoured only alongside that secret.
    """
    forwarded = request.META.get(SITE_HOST_HEADER, '')
    if forwarded:
        secret = settings.PUBLIC_SITE_PROXY_SECRET
        if secret and not constant_time_compare(request.META.get(PROXY_SECRET_HEADER, ''), secret):
            return ''
        return forwarded
    return request.get_host()


def resolve_domain(host: str):
    """Return the active domain (with its organization) serving ``host``, or None."""
    hostname = strip_port(host)
    if not hostname:
        return None
    return (
        OrganizationDomain.objects
        .select_related('organization')
        .filter(
            hostname=hostname,
            status=Status.ACTIVE,
            organization__is_active=True,
        )
        .first()
    )


def resolve_request_domain(request):
    domain = getattr(request, '_event_pro_site_domain', False)
    if domain is False:
        domain = resolve_domain(site_host_from_request(request))
        request._event_pro_site_domain = domain
    return domain


# ---------------------------------------------------------------------------
# Public links
# ---------------------------------------------------------------------------

def site_url_for(hostname: str) -> str:
    port = f':{settings.PUBLIC_SITE_PORT}' if settings.PUBLIC_SITE_PORT else ''
    return f'{settings.PUBLIC_SITE_SCHEME}://{hostname}{port}'


def primary_domain_for(organization_id):
    return OrganizationDomain.objects.filter(
        organization_id=organization_id,
        is_primary=True,
        status=Status.ACTIVE,
    ).first()


def public_base_url(organization_id) -> str:
    """Base URL for the organization's public pages, or '' when it has none."""
    domain = primary_domain_for(organization_id)
    return site_url_for(domain.hostname) if domain else ''


def build_event_rsvp_url(event, public_code: str) -> str:
    """``https://acme.com/rsvp/<event-slug>/<code>``, or '' with no domain."""
    base = public_base_url(event.organization_id)
    if not base or not event.slug:
        return ''
    return f'{base}/rsvp/{event.slug}/{public_code}'


# ---------------------------------------------------------------------------
# Platform subdomains
# ---------------------------------------------------------------------------

def ensure_platform_domain(organization):
    """Create (once) the free ``<slug>.<PUBLIC_SITE_ROOT_DOMAIN>`` domain."""
    hostname = platform_hostname_for(organization.slug)
    if not hostname:
        return None
    now = timezone.now()
    domain, created = OrganizationDomain.objects.get_or_create(
        hostname=hostname,
        defaults={
            'organization': organization,
            'type': Type.PLATFORM_SUBDOMAIN,
            'status': Status.ACTIVE,
            'verified_at': now,
            'activated_at': now,
            'last_check_message': 'Provided by Event Pro. No DNS changes needed.',
        },
    )
    if domain.organization_id != organization.pk:
        logger.error(
            'Platform hostname %s already belongs to organization %s',
            hostname, domain.organization_id,
        )
        return None
    if created:
        _promote_if_no_primary(organization.pk)
    return domain


# ---------------------------------------------------------------------------
# Primary domain bookkeeping
# ---------------------------------------------------------------------------

@transaction.atomic
def make_primary(domain):
    if domain.status != Status.ACTIVE:
        raise ValueError('Only an active domain can be the primary domain.')
    OrganizationDomain.objects.filter(
        organization_id=domain.organization_id, is_primary=True,
    ).exclude(pk=domain.pk).update(is_primary=False)
    if not domain.is_primary:
        domain.is_primary = True
        domain.save(update_fields=['is_primary', 'updated_at'])
    return domain


def _promote_if_no_primary(organization_id):
    """Keep guest links working: fall back to the oldest active domain."""
    if OrganizationDomain.objects.filter(organization_id=organization_id, is_primary=True).exists():
        return
    fallback = (
        OrganizationDomain.objects
        .filter(organization_id=organization_id, status=Status.ACTIVE)
        .order_by('created_at', 'id')
        .first()
    )
    if fallback:
        make_primary(fallback)


@transaction.atomic
def remove_domain(domain):
    if domain.is_platform:
        raise ValueError('The Event Pro subdomain cannot be removed.')
    organization_id = domain.organization_id
    domain.delete()
    _promote_if_no_primary(organization_id)


# ---------------------------------------------------------------------------
# DNS setup and verification
# ---------------------------------------------------------------------------

def dns_records_for(domain) -> list[dict]:
    """The records an admin must add, in the order they should add them."""
    if domain.is_platform:
        return []
    records = [{
        'type': 'TXT',
        'name': domain.verification_record_name,
        'value': domain.verification_record_value,
        'purpose': 'Proves you own this domain.',
    }]
    target = settings.PUBLIC_SITE_CNAME_TARGET
    addresses = settings.PUBLIC_SITE_IPV4_ADDRESSES
    if domain.type == Type.APEX_DOMAIN and addresses:
        records.extend({
            'type': 'A',
            'name': domain.hostname,
            'value': address,
            'purpose': 'Sends visitors to Event Pro.',
        } for address in addresses)
    elif domain.type == Type.APEX_DOMAIN and target:
        records.append({
            'type': 'ALIAS',
            'name': domain.hostname,
            'value': target,
            'purpose': 'Sends visitors to Event Pro. Your DNS provider may call this ANAME or CNAME flattening.',
        })
    elif target:
        records.append({
            'type': 'CNAME',
            'name': domain.hostname,
            'value': target,
            'purpose': 'Sends visitors to Event Pro.',
        })
    return records


def _routing_ok(hostname: str) -> tuple[bool, str]:
    target = settings.PUBLIC_SITE_CNAME_TARGET
    addresses = set(settings.PUBLIC_SITE_IPV4_ADDRESSES)
    if not target and not addresses:
        # No ingress configured (local development): ownership is enough.
        return True, ''
    if target and dns_lookup.cname_target(hostname) == target:
        return True, ''
    accepted = set(addresses)
    if target:
        # Apex "ALIAS"/flattened records surface as A records for the target.
        accepted |= dns_lookup.a_addresses(target)
    found = dns_lookup.a_addresses(hostname)
    if found and accepted and found <= accepted:
        return True, ''
    if found:
        return False, (
            f'{hostname} points to {", ".join(sorted(found))}, not to Event Pro. '
            'Update the record shown below and check again.'
        )
    return False, f'{hostname} does not point to Event Pro yet. Add the record shown below and check again.'


@transaction.atomic
def check_domain(domain):
    """Re-check DNS and move the domain through pending → verified → active.

    A domain that was verified or active and has lost its records is marked
    failed (and stops being primary) rather than silently left serving.
    """
    domain = OrganizationDomain.objects.select_for_update().get(pk=domain.pk)
    if domain.is_platform:
        return domain

    now = timezone.now()
    previously_live = domain.status in {Status.VERIFIED, Status.ACTIVE}
    domain.last_checked_at = now
    was_primary = domain.is_primary

    owned = domain.verification_record_value in dns_lookup.txt_values(domain.verification_record_name)
    if not owned:
        if previously_live:
            domain.status = Status.FAILED
            domain.is_primary = False
            domain.last_check_message = (
                f'The TXT record at {domain.verification_record_name} is missing, so this '
                'domain has stopped serving pages. Restore the record and check again.'
            )
        else:
            domain.last_check_message = (
                f'No matching TXT record found at {domain.verification_record_name} yet. '
                'DNS changes can take a few minutes, occasionally up to 48 hours.'
            )
        domain.save()
        if was_primary and not domain.is_primary:
            _promote_if_no_primary(domain.organization_id)
        return domain

    if domain.verified_at is None:
        domain.verified_at = now

    routed, message = _routing_ok(domain.hostname)
    if routed:
        domain.status = Status.ACTIVE
        domain.activated_at = domain.activated_at or now
        domain.last_check_message = 'Domain is active. HTTPS is issued automatically on the first visit.'
        domain.save()
        current = primary_domain_for(domain.organization_id)
        # A newly working custom domain should replace the free subdomain in
        # guest links; an admin's explicit choice between custom domains stays.
        if current is None or current.is_platform:
            make_primary(domain)
        return domain

    domain.status = Status.FAILED if domain.status == Status.ACTIVE else Status.VERIFIED
    domain.is_primary = False
    domain.last_check_message = message
    domain.save()
    if was_primary:
        _promote_if_no_primary(domain.organization_id)
    return domain


def is_tls_allowed(hostname: str) -> bool:
    """Whether the TLS terminator may obtain a certificate for ``hostname``."""
    return OrganizationDomain.objects.filter(
        hostname=strip_port(hostname),
        status__in=[Status.VERIFIED, Status.ACTIVE],
        organization__is_active=True,
    ).exists()
