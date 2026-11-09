# Organization domains

A domain belongs to an **organization**, not to an event. Every public page an
organization serves lives beneath its domains:

```text
acme.com/rsvp/annual-dinner/AbC123   → Acme's RSVP page for one guest   (live)
acme.com/                            → organization home page           (later)
acme.com/events                      → event catalogue                  (later)
acme.com/check-in                    → check-in experience              (later)
app.example.com                      → shared, signed-in admin app
```

Admin sign-in stays on the app domain, so session cookies never cross domains.

## Request flow

```text
Browser → acme.com/rsvp/annual-dinner/AbC123
  └─ frontend/proxy.ts           host is not in NEXT_PUBLIC_APP_HOSTNAMES
       ├─ page:  rewrite → /sites/acme.com/rsvp/annual-dinner/AbC123
       │         app/sites/[host]/layout.tsx resolves the host server-side (404 if unknown)
       └─ API:   /api/sites/* → INTERNAL_API_URL/sites/* + X-Event-Pro-Site-Host: acme.com
                 public_sites.services.resolve_request_domain()
                   → ACTIVE OrganizationDomain → Organization
                   → recipient looked up only within that organization and event slug
```

Only `active` domains of active organizations resolve. The proxy always
overwrites the site-host header, so visitors cannot choose a tenant. Set
`PUBLIC_SITE_PROXY_SECRET` (same value on backend and frontend) so the API
ignores that header unless the proxy sent it.

## Data model — `public_sites.OrganizationDomain`

| Field | Notes |
|---|---|
| `organization` | Owner. |
| `hostname` | Unique across the platform. Lowercase, IDNA, no port. |
| `type` | `platform_subdomain` · `custom_subdomain` · `apex_domain` |
| `status` | `pending` → `verified` (TXT found) → `active` (DNS points here). `failed` = it was live and lost its records. |
| `verification_token` | TXT value `eventpro-verify=<token>` at `_eventpro-verify.<hostname>`. |
| `is_primary` | At most one per organization, and it must be active. Guest links use it. |
| `verified_at`, `activated_at`, `last_checked_at`, `last_check_message` | Shown to the admin. |

`Event.slug` is unique per organization, generated once from the name, and
does not change on rename, so links already sent keep working.

## Link generation

`rsvp.whatsapp.build_rsvp_url()` uses the organization's primary domain:
`https://acme.com/rsvp/<event-slug>/<code>`. With no active domain it falls back
to the existing app-domain link. App-domain RSVP links keep working regardless.

When a custom domain becomes active it replaces the platform subdomain as
primary. Removing or failing the primary falls back to the oldest active domain.

## Setup experience

Admin → Company → **Domains** (owners and admins):

1. Enter `acme.com` or `rsvp.acme.com`.
2. Add the records shown: the TXT record, plus a CNAME (subdomain) or A/ALIAS
   records (apex).
3. Click **Check DNS**. TXT found → `verified`; routing correct → `active`.
4. HTTPS is issued on the first visit (see below).

## Configuration

Backend (`core/settings/public_sites.py`):

| Variable | Example | Purpose |
|---|---|---|
| `PUBLIC_SITE_ROOT_DOMAIN` | `events.example.com` | Free `<org-slug>.events.example.com` subdomains. Blank disables them. |
| `PUBLIC_SITE_CNAME_TARGET` | `sites.example.com` | What custom subdomains CNAME to. |
| `PUBLIC_SITE_IPV4_ADDRESSES` | `203.0.113.10` | A-record targets for apex domains. |
| `PUBLIC_SITE_SCHEME` / `PUBLIC_SITE_PORT` | `https` / blank | How guest links address the domain. |
| `PUBLIC_SITE_PROXY_SECRET` | random string | See request flow. |

With neither the CNAME target nor IPs set (local development), the TXT record
alone activates a domain.

Frontend:

| Variable | Example | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_HOSTNAMES` | `app.example.com` | Build-time. Every other host is an organization domain. |
| `INTERNAL_API_URL` | `http://backend:8000/api` | Server-side API address; its host must be in the backend `ALLOWED_HOSTS`. |
| `PUBLIC_SITE_PROXY_SECRET` | same as backend | |

Run `python manage.py sync_platform_domains` once after setting
`PUBLIC_SITE_ROOT_DOMAIN` to give existing organizations their subdomain. New
organizations get theirs automatically.

## Edge and HTTPS

Custom domains need certificates issued on demand, which nginx cannot do on its
own. Put Caddy (or another on-demand-TLS proxy) in front for organization
domains and gate issuance on the API:

```caddyfile
{
    on_demand_tls {
        ask http://127.0.0.1:8000/api/sites/tls-ask/
    }
}

https:// {
    tls {
        on_demand
    }
    # Django serves media only with DEBUG on, so serve the volume here.
    handle /media/* {
        root * /var/www
        file_server
    }
    handle {
        reverse_proxy 127.0.0.1:3000   # Next.js; proxy.ts does the rest
    }
}
```

`/api/sites/tls-ask/?domain=…` returns 200 only for verified or active
domains, so certificates are never requested for arbitrary hostnames.

On the app domain's `/api/` location, clear `X-Event-Pro-Site-Host` and
`X-Event-Pro-Proxy-Secret` so they can only arrive through the Next.js proxy.

## Adding later routes (phase 4)

1. Add the prefix to `SITE_ROUTE_PREFIXES` in `frontend/proxy.ts` and to
   `PUBLIC_ROUTES` in `public_sites/views.py`.
2. Add pages under `frontend/app/sites/[host]/…`; the layout has already
   resolved the organization.
3. Add API views to `public_sites/urls.py` (`public_urlpatterns`) that call
   `resolve_request_domain()` and filter every query by its organization.

No domain-model change is needed.

## Local testing

Browsers resolve `*.localhost` to your machine. With the dev Compose settings,
organization `acme` is served at `http://acme.localhost:3000/rsvp/…`.
