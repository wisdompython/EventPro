import os

# ---------------------------------------------------------------------------
# Organization public sites — branded domains that serve guest-facing pages
# (RSVP first) for one organization. Admin sign-in stays on SITE_URL.
# ---------------------------------------------------------------------------

# Wildcard parent for free platform subdomains: with "events.example.com",
# organization "acme" is served at acme.events.example.com. Blank disables
# platform subdomains.
PUBLIC_SITE_ROOT_DOMAIN = os.environ.get('PUBLIC_SITE_ROOT_DOMAIN', '').strip().lower().rstrip('.')

# How generated guest links address an organization's domain. Production is
# https with no port; local testing against acme.localhost uses http and 3000.
PUBLIC_SITE_SCHEME = os.environ.get('PUBLIC_SITE_SCHEME', 'https')
PUBLIC_SITE_PORT = os.environ.get('PUBLIC_SITE_PORT', '').strip()

# Where customers point their DNS. A subdomain CNAMEs to the target; an apex
# domain (which cannot CNAME) uses A records to the listed addresses. When both
# are blank, activation only requires the TXT ownership record (local dev).
PUBLIC_SITE_CNAME_TARGET = os.environ.get('PUBLIC_SITE_CNAME_TARGET', '').strip().lower().rstrip('.')
PUBLIC_SITE_IPV4_ADDRESSES = [
    a.strip() for a in os.environ.get('PUBLIC_SITE_IPV4_ADDRESSES', '').split(',') if a.strip()
]

# Shared secret the Next.js proxy sends alongside the site host header. When
# set, the API ignores a site host header that arrives without it, so only the
# proxy can choose which organization a public request is scoped to.
PUBLIC_SITE_PROXY_SECRET = os.environ.get('PUBLIC_SITE_PROXY_SECRET', '')

# DNS name prefix for the ownership TXT record: _eventpro-verify.acme.com
PUBLIC_SITE_VERIFICATION_PREFIX = '_eventpro-verify'
