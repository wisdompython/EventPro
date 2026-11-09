from unittest.mock import patch

from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Membership, MembershipRole, Organization, User
from guests.models import Event, Guest
from rsvp.models import RsvpRecipient, RsvpWorkflow
from rsvp.whatsapp import build_rsvp_url

from .hostnames import InvalidHostname, classify_custom_hostname, normalize_hostname
from .models import OrganizationDomain
from .services import check_domain, ensure_platform_domain, make_primary, resolve_domain

Status = OrganizationDomain.Status
Type = OrganizationDomain.Type

NO_INGRESS = {'PUBLIC_SITE_CNAME_TARGET': '', 'PUBLIC_SITE_IPV4_ADDRESSES': []}
WITH_INGRESS = {'PUBLIC_SITE_CNAME_TARGET': 'sites.eventpro.test', 'PUBLIC_SITE_IPV4_ADDRESSES': ['203.0.113.10']}


def make_org(slug, name=None):
    return Organization.objects.create(name=name or slug.title(), slug=slug)


def make_domain(organization, hostname, *, status=Status.ACTIVE, primary=False, type=Type.CUSTOM_SUBDOMAIN):
    return OrganizationDomain.objects.create(
        organization=organization, hostname=hostname, type=type,
        status=status, is_primary=primary,
    )


def make_recipient(organization, event_name='Annual Dinner', guest_name='Ada Guest'):
    event = Event.objects.create(
        organization=organization, name=event_name,
        date=timezone.now() + timezone.timedelta(days=10),
    )
    workflow = RsvpWorkflow.objects.create(event=event, status=RsvpWorkflow.Status.ACTIVE)
    guest = Guest.objects.create(event=event, full_name=guest_name, phone_number='2348000000001')
    return RsvpRecipient.objects.create(workflow=workflow, guest=guest)


class HostnameTests(TestCase):
    def test_normalizes_what_admins_paste(self):
        self.assertEqual(normalize_hostname('https://RSVP.Acme.com:8443/path?x=1'), 'rsvp.acme.com')
        self.assertEqual(normalize_hostname('acme.com.'), 'acme.com')
        self.assertEqual(normalize_hostname('bücher.example'), 'xn--bcher-kva.example')

    def test_rejects_invalid_hosts(self):
        for value in ['', 'localhost', '10.0.0.1', '-bad.com', 'a..com', 'acme.123']:
            with self.subTest(value=value), self.assertRaises(InvalidHostname):
                normalize_hostname(value)

    def test_classifies_apex_and_subdomains(self):
        self.assertEqual(classify_custom_hostname('acme.com'), Type.APEX_DOMAIN)
        self.assertEqual(classify_custom_hostname('acme.com.ng'), Type.APEX_DOMAIN)
        self.assertEqual(classify_custom_hostname('rsvp.acme.com'), Type.CUSTOM_SUBDOMAIN)
        self.assertEqual(classify_custom_hostname('rsvp.acme.co.uk'), Type.CUSTOM_SUBDOMAIN)


class EventSlugTests(TestCase):
    def test_slug_is_unique_per_organization_and_stable_on_rename(self):
        acme, beta = make_org('acme'), make_org('beta')
        first = Event.objects.create(organization=acme, name='Annual Dinner', date=timezone.now())
        second = Event.objects.create(organization=acme, name='Annual Dinner', date=timezone.now())
        other = Event.objects.create(organization=beta, name='Annual Dinner', date=timezone.now())
        self.assertEqual(first.slug, 'annual-dinner')
        self.assertEqual(second.slug, 'annual-dinner-2')
        self.assertEqual(other.slug, 'annual-dinner')

        first.name = 'Annual Gala'
        first.save()
        first.refresh_from_db()
        self.assertEqual(first.slug, 'annual-dinner')


class ResolutionTests(TestCase):
    def test_only_active_domains_of_active_organizations_resolve(self):
        acme, beta = make_org('acme'), make_org('beta')
        make_domain(acme, 'acme.com')
        make_domain(beta, 'beta.com', status=Status.VERIFIED)
        self.assertEqual(resolve_domain('ACME.com:443').organization, acme)
        self.assertIsNone(resolve_domain('beta.com'))
        self.assertIsNone(resolve_domain('unknown.com'))

        acme.is_active = False
        acme.save()
        self.assertIsNone(resolve_domain('acme.com'))

    def test_one_primary_per_organization_and_primary_must_be_active(self):
        acme = make_org('acme')
        make_domain(acme, 'acme.com', primary=True)
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_domain(acme, 'rsvp.acme.com', primary=True)
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_domain(acme, 'events.acme.com', status=Status.PENDING, primary=True)

    @override_settings(PUBLIC_SITE_ROOT_DOMAIN='eventpro.test')
    def test_new_organization_gets_an_active_primary_platform_subdomain(self):
        acme = make_org('acme')
        domain = acme.domains.get()
        self.assertEqual(domain.hostname, 'acme.eventpro.test')
        self.assertEqual(domain.type, Type.PLATFORM_SUBDOMAIN)
        self.assertEqual(domain.status, Status.ACTIVE)
        self.assertTrue(domain.is_primary)
        # Idempotent.
        self.assertEqual(ensure_platform_domain(acme), domain)
        self.assertEqual(acme.domains.count(), 1)


class RsvpLinkTests(TestCase):
    @override_settings(SITE_URL='https://app.eventpro.test', PUBLIC_SITE_SCHEME='https', PUBLIC_SITE_PORT='')
    def test_link_uses_primary_domain_and_falls_back_to_app(self):
        acme = make_org('acme')
        recipient = make_recipient(acme)
        self.assertEqual(
            build_rsvp_url(recipient),
            f'https://app.eventpro.test/annual-dinner/rsvp/ada-guest-{recipient.public_code}',
        )

        make_domain(acme, 'acme.com', primary=True)
        self.assertEqual(
            build_rsvp_url(recipient),
            f'https://acme.com/rsvp/annual-dinner/{recipient.public_code}',
        )


class SiteRsvpApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.acme, self.beta = make_org('acme'), make_org('beta')
        make_domain(self.acme, 'acme.com', primary=True)
        make_domain(self.beta, 'beta.com', primary=True)
        self.acme_recipient = make_recipient(self.acme)
        self.beta_recipient = make_recipient(self.beta, event_name='Launch Party')

    def url(self, recipient, slug=None):
        return f'/api/sites/rsvp/{slug or recipient.workflow.event.slug}/{recipient.public_code}/'

    def get(self, url, host):
        return self.client.get(url, HTTP_X_EVENT_PRO_SITE_HOST=host)

    def test_serves_rsvp_scoped_to_host_organization(self):
        response = self.get(self.url(self.acme_recipient), 'acme.com')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['guest_name'], 'Ada Guest')
        self.assertEqual(response.data['organization_name'], 'Acme')

    def test_code_from_another_organization_is_not_found(self):
        self.assertEqual(self.get(self.url(self.beta_recipient), 'acme.com').status_code, 404)

    def test_code_under_the_wrong_event_slug_is_not_found(self):
        Event.objects.create(organization=self.acme, name='Other', date=timezone.now())
        self.assertEqual(self.get(self.url(self.acme_recipient, slug='other'), 'acme.com').status_code, 404)

    def test_unknown_or_inactive_host_is_not_found(self):
        self.assertEqual(self.get(self.url(self.acme_recipient), 'evil.com').status_code, 404)
        self.acme.domains.update(is_primary=False)
        self.acme.domains.update(status=Status.VERIFIED)
        self.assertEqual(self.get(self.url(self.acme_recipient), 'acme.com').status_code, 404)

    @patch('rsvp.tasks.send_confirmed_pass.delay')
    def test_response_can_be_submitted(self, _send):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                self.url(self.acme_recipient), {'answer': 'no'}, format='json',
                HTTP_X_EVENT_PRO_SITE_HOST='acme.com',
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.acme_recipient.refresh_from_db()
        self.assertEqual(self.acme_recipient.response_status, RsvpRecipient.ResponseStatus.DECLINED)

    @override_settings(PUBLIC_SITE_PROXY_SECRET='s3cret')
    def test_site_host_header_requires_proxy_secret_when_configured(self):
        url = self.url(self.acme_recipient)
        self.assertEqual(self.get(url, 'acme.com').status_code, 404)
        response = self.client.get(
            url, HTTP_X_EVENT_PRO_SITE_HOST='acme.com', HTTP_X_EVENT_PRO_PROXY_SECRET='s3cret',
        )
        self.assertEqual(response.status_code, 200)

    def test_site_context(self):
        response = self.client.get('/api/sites/current/', HTTP_X_EVENT_PRO_SITE_HOST='beta.com')
        self.assertEqual(response.data['organization']['slug'], 'beta')
        self.assertEqual(response.data['routes'], ['rsvp'])

    def test_tls_ask_allows_only_verified_or_active_domains(self):
        make_domain(self.acme, 'pending.acme.com', status=Status.PENDING)
        self.assertEqual(self.client.get('/api/sites/tls-ask/?domain=acme.com').status_code, 200)
        self.assertEqual(self.client.get('/api/sites/tls-ask/?domain=pending.acme.com').status_code, 404)
        self.assertEqual(self.client.get('/api/sites/tls-ask/?domain=nope.com').status_code, 404)


class VerificationTests(TestCase):
    def setUp(self):
        self.acme = make_org('acme')
        self.platform = make_domain(self.acme, 'acme.eventpro.test', primary=True, type=Type.PLATFORM_SUBDOMAIN)
        self.domain = make_domain(self.acme, 'rsvp.acme.com', status=Status.PENDING)

    def dns(self, *, txt=(), cname='', a=()):
        records = {
            'txt': list(txt), 'cname': cname,
            'a': {'rsvp.acme.com': set(a), 'sites.eventpro.test': {'203.0.113.10'}},
        }
        return [
            patch('public_sites.dns_lookup.txt_values', side_effect=lambda name: records['txt']),
            patch('public_sites.dns_lookup.cname_target', side_effect=lambda name: records['cname']),
            patch('public_sites.dns_lookup.a_addresses', side_effect=lambda name: records['a'].get(name, set())),
        ]

    def check(self, **dns):
        patches = self.dns(**dns)
        for p in patches:
            p.start()
        try:
            return check_domain(self.domain)
        finally:
            for p in patches:
                p.stop()

    @override_settings(**WITH_INGRESS)
    def test_missing_txt_keeps_domain_pending(self):
        domain = self.check()
        self.assertEqual(domain.status, Status.PENDING)
        self.assertIn('No matching TXT record', domain.last_check_message)

    @override_settings(**WITH_INGRESS)
    def test_txt_without_routing_is_verified_only(self):
        domain = self.check(txt=[self.domain.verification_record_value])
        self.assertEqual(domain.status, Status.VERIFIED)
        self.assertIsNotNone(domain.verified_at)
        self.assertFalse(domain.is_primary)

    @override_settings(**WITH_INGRESS)
    def test_txt_and_cname_activate_and_replace_platform_primary(self):
        domain = self.check(txt=[self.domain.verification_record_value], cname='sites.eventpro.test')
        self.assertEqual(domain.status, Status.ACTIVE)
        self.assertTrue(domain.is_primary)
        self.platform.refresh_from_db()
        self.assertFalse(self.platform.is_primary)

    @override_settings(**WITH_INGRESS)
    def test_a_records_pointing_elsewhere_do_not_activate(self):
        domain = self.check(txt=[self.domain.verification_record_value], a=['198.51.100.1'])
        self.assertEqual(domain.status, Status.VERIFIED)
        self.assertIn('198.51.100.1', domain.last_check_message)

    @override_settings(**NO_INGRESS)
    def test_without_ingress_configured_txt_alone_activates(self):
        domain = self.check(txt=[self.domain.verification_record_value])
        self.assertEqual(domain.status, Status.ACTIVE)

    @override_settings(**WITH_INGRESS)
    def test_lost_txt_record_fails_domain_and_restores_platform_primary(self):
        self.check(txt=[self.domain.verification_record_value], cname='sites.eventpro.test')
        domain = self.check()
        self.assertEqual(domain.status, Status.FAILED)
        self.assertFalse(domain.is_primary)
        self.platform.refresh_from_db()
        self.assertTrue(self.platform.is_primary)


class DomainAdminApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.acme, self.beta = make_org('acme'), make_org('beta')
        self.owner = User.objects.create_user(username='owner', password='pass')
        Membership.objects.create(organization=self.acme, user=self.owner, role=MembershipRole.OWNER)
        self.client.force_authenticate(self.owner)

    def test_admin_adds_domain_and_sees_dns_instructions(self):
        with self.settings(**WITH_INGRESS):
            response = self.client.post('/api/auth/domains/', {'hostname': 'https://Acme.com/'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['hostname'], 'acme.com')
        self.assertEqual(response.data['type'], Type.APEX_DOMAIN)
        self.assertEqual(response.data['status'], Status.PENDING)
        types = [record['type'] for record in response.data['dns_records']]
        self.assertEqual(types, ['TXT', 'A'])
        domain = OrganizationDomain.objects.get(hostname='acme.com')
        self.assertEqual(domain.organization, self.acme)

    def test_cannot_claim_a_hostname_held_by_another_organization(self):
        make_domain(self.beta, 'beta.com')
        response = self.client.post('/api/auth/domains/', {'hostname': 'beta.com'}, format='json')
        self.assertEqual(response.status_code, 400)

    @override_settings(SITE_URL='https://app.eventpro.test', PUBLIC_SITE_ROOT_DOMAIN='eventpro.test')
    def test_cannot_claim_platform_hostnames(self):
        for hostname in ['app.eventpro.test', 'beta.eventpro.test']:
            response = self.client.post('/api/auth/domains/', {'hostname': hostname}, format='json')
            self.assertEqual(response.status_code, 400, hostname)

    def test_other_organizations_domains_are_invisible(self):
        beta_domain = make_domain(self.beta, 'beta.com')
        mine = make_domain(self.acme, 'acme.com')
        listed = self.client.get('/api/auth/domains/').data
        self.assertEqual([d['hostname'] for d in listed], ['acme.com'])
        self.assertEqual(self.client.post(f'/api/auth/domains/{beta_domain.id}/verify/').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/auth/domains/{beta_domain.id}/').status_code, 404)
        self.assertEqual(self.client.post(f'/api/auth/domains/{mine.id}/make-primary/').status_code, 200)

    def test_viewers_cannot_manage_domains(self):
        viewer = User.objects.create_user(username='viewer', password='pass')
        Membership.objects.create(organization=self.acme, user=viewer, role=MembershipRole.VIEWER)
        self.client.force_authenticate(viewer)
        self.assertEqual(self.client.get('/api/auth/domains/').status_code, 403)

    def test_platform_subdomain_cannot_be_removed(self):
        platform = make_domain(self.acme, 'acme.eventpro.test', primary=True, type=Type.PLATFORM_SUBDOMAIN)
        self.assertEqual(self.client.delete(f'/api/auth/domains/{platform.id}/').status_code, 400)

    def test_removing_primary_falls_back_to_another_active_domain(self):
        platform = make_domain(self.acme, 'acme.eventpro.test', type=Type.PLATFORM_SUBDOMAIN)
        custom = make_domain(self.acme, 'acme.com')
        make_primary(custom)
        self.assertEqual(self.client.delete(f'/api/auth/domains/{custom.id}/').status_code, 204)
        platform.refresh_from_db()
        self.assertTrue(platform.is_primary)
