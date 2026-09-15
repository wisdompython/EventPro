# Prompt: Admin-configurable messaging settings page

Build a settings page in Event Pro (`C:\Users\Hp\Documents\event pro`) that lets an
organization's Owner/Administrator change the WhatsApp and RSVP delivery values that
are currently hardcoded or read from environment variables at process start.

Read this whole brief before writing code. Several of these values cannot simply be
moved to the database — see "Values that need a code change first".

---

## Why

These values are operational, not deployment concerns. An organiser running a
5,000-guest wedding needs a different daily send cap and reminder policy than one
running a 200-guest corporate dinner, and today changing either means editing
`.env` and restarting the containers. In a multi-tenant SaaS, one tenant's Meta
messaging tier has nothing to do with another's, so a single global env var is
the wrong shape.

## Tenancy — read this first

The codebase already has `accounts.Organization` and `accounts.Membership`
(roles: owner, admin, manager, check_in, scanner, viewer), and `guests`/`rsvp`
models are scoped by an `organization` FK defaulting to
`get_default_organization_id()`.

Settings must be **per organization**, not global. Every read of a setting must
resolve through the organization that owns the event/workflow/recipient being
acted on — not through the requesting user, because Celery tasks have no request.

Add `platform-level` overrides too: a super-admin ceiling that a tenant cannot
exceed (see "Guardrails").

## Scope of settings to expose

Group the page into three sections.

### 1. WhatsApp sending

| Setting | Today | Where |
|---|---|---|
| Daily send limit (Meta messaging tier) | `WHATSAPP_DAILY_SEND_LIMIT`, default 2000 | `core/settings/whatsapp.py:21`, read via `guests/send_budget.py:33` |
| Messages per minute (guest passes) | hardcoded `20` | `guests/tasks.py:21` |
| Messages per minute (RSVP) | hardcoded `20` | `rsvp/tasks.py:13` |

### 2. RSVP reminders

| Setting | Today | Where |
|---|---|---|
| Max reminders per guest | `RSVP_MAX_REMINDERS`, default 3 | `core/settings/base.py:130`, used `rsvp/views.py:482` |
| Reminder cooldown (minutes) | `RSVP_REMINDER_COOLDOWN_MINUTES`, default 360 | `core/settings/base.py:129`, used `rsvp/views.py:477` |

### 3. Delivery retries

| Setting | Today | Where |
|---|---|---|
| Max automatic retries for failed sends | hardcoded `3` | `rsvp/tasks.py:21` `FAILED_SEND_MAX_AUTO_RETRIES` |
| Transient-error backoff schedule | hardcoded `(1h, 4h, 12h)` | `rsvp/tasks.py:41` `FAILED_SEND_RETRY_DELAYS` |
| Ecosystem-cap backoff schedule | hardcoded `(24h, 24h, 24h)` | `rsvp/tasks.py:33` `ECOSYSTEM_RETRY_DELAYS` |

Explicitly **out of scope** — do not put these on the page: `WHATSAPP_TOKEN`,
`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_ID`, database
credentials, `SECRET_KEY`. Credentials stay in the environment.

## Values that need a code change first

**This is the part most likely to be got wrong.** Three of the settings above are
consumed in ways a database lookup cannot reach:

1. **The two "messages per minute" values** are baked into Celery task decorators
   at import time:
   ```python
   @shared_task(rate_limit=WHATSAPP_RATE_LIMIT)   # guests/tasks.py
   @shared_task(rate_limit=RSVP_RATE_LIMIT)       # rsvp/tasks.py
   ```
   A decorator argument is evaluated once when the worker imports the module. Writing
   a new value to the database will **not** change it, and a page that pretends
   otherwise is worse than no page. Also note the rate limit is **per worker
   process** — the real throughput is this number times the worker count, which
   `platform_ops/monitor.py:322-325` already computes and displays.

   Decide and state your approach. Options, roughly in order of preference:
   - Keep the decorator as a ceiling, apply the per-org value as an additional
     in-task throttle/spacing check.
   - Make it a global-only setting (not per-org), surfaced as read-only on the page
     with an explanation that it requires a worker restart, and changed via env.
   - Use Celery's runtime `control.rate_limit()` broadcast on save.

   Do not silently pick one — call it out in your summary.

2. **`FAILED_SEND_MAX_AUTO_RETRIES`** is used inside a queryset filter
   (`rsvp/tasks.py:171`), so it *can* become a per-org lookup, but the query is
   currently one flat filter across all recipients. Moving to per-org values means
   either grouping by organization or joining the setting in. Don't produce an
   N+1 over recipients.

3. **The backoff tuples** are indexed by attempt count in `retry_delay_for()`
   (`rsvp/tasks.py:67-75`). If these become configurable, validate that the stored
   list is non-empty, or that function will `IndexError` on a real send.

Everything else (daily send limit, max reminders, cooldown) is a straightforward
`settings.X` → per-org lookup.

## Backend requirements

- New model, e.g. `accounts.OrganizationMessagingSettings`, OneToOne with
  `Organization`. Nullable columns meaning "inherit the platform default" — do
  **not** copy defaults into every row on creation, or changing a default later
  won't propagate.
- A single resolver used by *every* consumer, e.g.
  `messaging_settings_for(organization_id)`, returning resolved values with
  platform defaults applied. Cache it per request/task; it will be called inside
  dispatcher loops that run every 5 minutes over many rows.
- Replace every `settings.RSVP_MAX_REMINDERS` /
  `settings.RSVP_REMINDER_COOLDOWN_MINUTES` / `settings.WHATSAPP_DAILY_SEND_LIMIT`
  read with the resolver. `remaining_send_budget()` in `guests/send_budget.py` is
  currently **global across all tenants** — it counts every RsvpRecipient, Guest
  and ReminderLog in the database. With per-org limits this must be scoped per
  organization, or one tenant's sends will exhaust another's budget. Treat this
  as a correctness bug to fix, not an optional extra.
- Keep env vars working as the **platform default** when no per-org row exists,
  so existing deployments behave identically after the migration.
- Audit trail: who changed what, from what, to what, when. These values control
  spend and deliverability; "who raised the daily cap to 10000" must be
  answerable.
- Permissions: only `owner` and `admin` memberships may write. Everyone else gets
  read-only or 403, consistent with how the existing viewsets enforce roles.
- REST endpoints under the existing API conventions, with tests covering:
  tenant isolation (org A cannot read or write org B's settings), role
  enforcement, validation bounds, and fallback-to-default when no row exists.

## Guardrails and validation

Bad values here cause real damage — a daily limit above the account's actual Meta
tier strands sends in a failed state; a 0-minute reminder cooldown gets the
business number blocked.

- Enforce min/max on every field. Daily send limit must not exceed a
  platform-level ceiling that only a super-admin can raise.
- Reminder cooldown: floor of at least 60 minutes. Max reminders: cap at ~5.
- Reject zero/negative everywhere; reject empty backoff lists.
- Show the effective value and where it came from (org override vs platform
  default) so an admin can tell why a number is what it is.

## Frontend requirements

Next.js admin area, matching the existing design-token styling
(`var(--ink)`, `var(--panel)`, `var(--line)`, `var(--brand)`) used across
`frontend/app/admin/`.

- New page under `frontend/app/admin/settings/` with the three sections above.
- **Write for a non-technical organiser.** Every field needs a plain-language
  label and one line of help text explaining the consequence, not the mechanism.
  Use the wording already in `docs/rsvp_workflow.md` under "Reminding guests who
  have not responded" as the voice to match — e.g. "How many times a guest who
  hasn't replied can be reminded. Guests who receive repeated unanswered messages
  may block your number, which affects delivery for all your events."
- Never show raw env var names as the primary label. Mention them secondarily if
  useful for support.
- Show current value, the platform default, and a "Reset to default" per field.
- Fields that require a worker restart (see above) must say so on the field
  itself, not in a footnote.
- Dirty-state guard, inline validation errors from the API, success toast
  consistent with other admin pages.

## Deliverable

Working code plus:
- A short migration note for existing deployments.
- An update to `docs/rsvp_workflow.md` pointing at the new page from the
  "Reminding guests who have not responded" section, which currently tells
  admins to edit the environment file.
- Your decision on the rate-limit problem in point 1, stated explicitly.

## Suggested order

1. Model + resolver + platform defaults, with tests.
2. Migrate the three straightforward reads (daily limit, max reminders,
   cooldown), including scoping `remaining_send_budget()` per organization.
3. API + permissions + tenancy tests.
4. Frontend page.
5. Retry/backoff settings.
6. Rate limit — last, since it needs a design decision, and may end up
   deliberately read-only.
