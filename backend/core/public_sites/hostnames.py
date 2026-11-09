"""Hostname parsing and classification. Pure functions, no database access."""
import ipaddress
import re
from urllib.parse import urlsplit

from django.conf import settings

from .models import OrganizationDomain

_LABEL = re.compile(r'^(?!-)[a-z0-9-]{1,63}(?<!-)$')

# Public suffixes with two labels that customers in our markets commonly use.
# Enough to tell "acme.com.ng" (apex) from "rsvp.acme.com" (subdomain) without
# shipping the full Public Suffix List; an unlisted suffix only means the
# admin is shown CNAME instructions where A records would also have worked.
_TWO_LABEL_SUFFIXES = {
    'com.ng', 'org.ng', 'net.ng', 'edu.ng', 'gov.ng', 'name.ng',
    'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk',
    'co.za', 'org.za', 'com.gh', 'org.gh', 'co.ke', 'or.ke',
    'com.au', 'net.au', 'org.au', 'co.nz', 'co.in', 'com.br',
}


class InvalidHostname(ValueError):
    pass


def normalize_hostname(value: str) -> str:
    """Return ``value`` as a bare, lowercase, ASCII hostname.

    Accepts what an admin is likely to paste: a URL, a host with a port, a
    trailing dot, or an internationalised name.
    """
    raw = (value or '').strip()
    if not raw:
        raise InvalidHostname('Enter a domain name.')
    if '://' not in raw:
        raw = f'//{raw}'
    try:
        host = urlsplit(raw).hostname or ''
    except ValueError as exc:
        raise InvalidHostname('Enter a domain name such as rsvp.example.com.') from exc
    host = host.rstrip('.')
    try:
        host = host.encode('idna').decode('ascii').lower()
    except UnicodeError as exc:
        raise InvalidHostname('That domain name contains characters that are not allowed.') from exc
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise InvalidHostname('Use a domain name, not an IP address.')
    labels = host.split('.')
    if len(host) > 253 or len(labels) < 2 or not all(_LABEL.match(label) for label in labels):
        raise InvalidHostname('Enter a domain name such as rsvp.example.com.')
    if labels[-1].isdigit():
        raise InvalidHostname('Enter a domain name such as rsvp.example.com.')
    return host


def strip_port(host: str) -> str:
    """``acme.com:443`` → ``acme.com``; tolerant of junk (returns '')."""
    try:
        return normalize_hostname(host)
    except InvalidHostname:
        return ''


def is_apex(hostname: str) -> bool:
    labels = hostname.split('.')
    if len(labels) == 2:
        return True
    return len(labels) == 3 and '.'.join(labels[1:]) in _TWO_LABEL_SUFFIXES


def classify_custom_hostname(hostname: str) -> str:
    return (
        OrganizationDomain.Type.APEX_DOMAIN
        if is_apex(hostname)
        else OrganizationDomain.Type.CUSTOM_SUBDOMAIN
    )


def platform_hostname_for(slug: str) -> str:
    root = settings.PUBLIC_SITE_ROOT_DOMAIN
    return f'{slug}.{root}' if root else ''


def reserved_hostnames() -> set:
    """Hostnames that belong to the platform itself and can never be claimed."""
    hosts = set()
    site_host = urlsplit(settings.SITE_URL).hostname
    if site_host:
        hosts.add(site_host.lower())
    for host in settings.ALLOWED_HOSTS:
        host = host.lstrip('.').lower()
        if host and host != '*':
            hosts.add(host)
    if settings.PUBLIC_SITE_CNAME_TARGET:
        hosts.add(settings.PUBLIC_SITE_CNAME_TARGET)
    return hosts


def is_reserved(hostname: str) -> bool:
    if hostname in reserved_hostnames():
        return True
    root = settings.PUBLIC_SITE_ROOT_DOMAIN
    # Platform subdomains are issued by us, never claimed by hand.
    return bool(root) and (hostname == root or hostname.endswith(f'.{root}'))
