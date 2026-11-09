"""Thin DNS wrappers so verification logic can be tested without the network."""
import logging

logger = logging.getLogger(__name__)

LOOKUP_TIMEOUT_SECONDS = 5.0


def _resolve(name: str, record_type: str) -> list:
    import dns.exception
    import dns.resolver

    resolver = dns.resolver.Resolver()
    resolver.lifetime = LOOKUP_TIMEOUT_SECONDS
    try:
        return list(resolver.resolve(name, record_type))
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers):
        return []
    except dns.exception.DNSException:
        logger.warning('DNS lookup failed for %s %s', record_type, name, exc_info=True)
        return []


def txt_values(name: str) -> list[str]:
    values = []
    for answer in _resolve(name, 'TXT'):
        # A TXT record may be split into several character strings.
        values.append(b''.join(answer.strings).decode('utf-8', 'replace').strip())
    return values


def cname_target(name: str) -> str:
    answers = _resolve(name, 'CNAME')
    return str(answers[0].target).rstrip('.').lower() if answers else ''


def a_addresses(name: str) -> set[str]:
    return {answer.address for answer in _resolve(name, 'A')}
