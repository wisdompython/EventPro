# Migration note — per-workspace messaging settings

Moves the WhatsApp and RSVP delivery values from process-start environment
variables to per-organization settings editable at **Admin → Messaging
settings**, and fixes a tenancy bug in the daily send budget.

## What existing deployments need to do

1. Deploy the backend.
2. Run `python manage.py migrate` — adds `accounts_organizationmessagingsettings`
   and `accounts_messagingsettingsauditlog`. Both are new tables; no existing
   table is altered and no data is backfilled.
3. Restart the web, Celery worker, and Celery Beat services.
4. Deploy the frontend.

**No configuration change is required.** No organization has an override row
after the migration, so every value resolves to the same environment variable
it did before, and behaviour is identical until an admin changes something on
the new page.

## Behaviour that changes without any configuration change

**The daily send budget is now counted per organization.** This is a bug fix,
not a new option. `remaining_send_budget()` previously counted every
`RsvpRecipient`, `Guest` and `ReminderLog` row in the database against a single
global `WHATSAPP_DAILY_SEND_LIMIT`, so in a multi-tenant deployment one
workspace's sends consumed every other workspace's allowance.

If you run more than one active organization, expect each to now have its own
full allowance. Total sends across the deployment can therefore rise to
(number of active organizations × the limit). Where that is not what you want,
set a lower per-workspace limit on each workspace's settings page.

Single-tenant deployments see no change.

## Environment variables

All existing variables keep working and now act as the **platform default** for
any workspace that has not set its own value. Raising a default still
propagates to every workspace that has not overridden it — defaults are
resolved at read time, not copied into rows.

| Variable | Role now | Default |
|---|---|---|
| `WHATSAPP_DAILY_SEND_LIMIT` | Platform default daily limit | 2000 |
| `RSVP_MAX_REMINDERS` | Platform default reminder cap | 3 |
| `RSVP_REMINDER_COOLDOWN_MINUTES` | Platform default cooldown | 360 |
| `WHATSAPP_MESSAGES_PER_MINUTE` | Platform default pass sending speed | 20 |
| `RSVP_MESSAGES_PER_MINUTE` | Platform default RSVP sending speed | 20 |
| `FAILED_SEND_MAX_AUTO_RETRIES` | Platform default automatic retries | 3 |

New variables, all optional. These are **platform ceilings**: a tenant cannot
configure past them, and only someone with access to the environment can raise
them.

| Variable | Meaning | Default |
|---|---|---|
| `WHATSAPP_DAILY_SEND_LIMIT_CEILING` | Highest daily limit a tenant may set | 100000 |
| `RSVP_MAX_REMINDERS_CEILING` | Highest reminder cap a tenant may set | 5 |
| `RSVP_REMINDER_COOLDOWN_FLOOR_MINUTES` | Shortest cooldown a tenant may set | 60 |
| `FAILED_SEND_MAX_AUTO_RETRIES_CEILING` | Highest retry count a tenant may set | 10 |
| `WHATSAPP_WORKER_RATE_LIMIT_PER_MINUTE` | Celery per-worker task rate limit | 20 |

A stored value above a ceiling you later lower is clamped at read time rather
than rejected, so lowering a ceiling takes effect immediately and cannot strand
a tenant on an out-of-policy number.

## The rate-limit ceiling requires a worker restart

`WHATSAPP_WORKER_RATE_LIMIT_PER_MINUTE` feeds
`@shared_task(rate_limit=...)`, which Celery binds when the worker imports the
task module. Changing it needs a worker restart; it cannot be made per-tenant.
The settings page states this on the field rather than in a footnote. See
"Decision: the rate-limit problem" in the implementation summary.

## Rollback

Revert the code and leave the tables in place — they are additive and unread by
the previous version. Overrides saved in the meantime become inert, and every
value returns to its environment variable. If you roll forward again, the saved
overrides take effect once more.

## Verifying after deploy

- Open **Admin → Messaging settings** as an owner or admin. Every field should
  read "Recommended", matching your current environment values.
- Change one value, save, and confirm **Change history** records who changed
  what, from what, to what.
- Sign in as a manager or viewer: the page must load read-only and a write must
  return 403.
