# Admin workflow review-agent catalog

Each workflow below has three named, read-only agents:

- `logic.<workflow>` uses [logic-reviewer.md](logic-reviewer.md)
- `frontend.<workflow>` uses [frontend-reviewer.md](frontend-reviewer.md)
- `design.<workflow>` uses [admin-design-review-agent.md](../admin-design-review-agent.md)

To run one in a new Codex conversation, use this prompt and replace the values:

```text
Run the <agent-name> review for Event Pro.
Use <reviewer-file> and review only this scope: <scope>.
Inspect the rendered screen where available. Do not edit files or change data.
```

## Agent registry

| Workflow | Named agents | Scope |
|---|---|---|
| Today dashboard | `logic.today`, `frontend.today`, `design.today` | `/admin/today`; dashboard summaries, current-event selection, activity/arrival data, dashboard components. |
| Event management | `logic.event-management`, `frontend.event-management`, `design.event-management` | `/admin/event-management`, create, detail, edit, reminders; event lifecycle, locations, guest rules, delivery mode, and event forms. |
| Guest management | `logic.guest-management`, `frontend.guest-management`, `design.guest-management` | `/admin/guestbook`, add, search, detail; guest CRUD, filters, guest assets, exports, plus-one relationships, and event scoping. |
| Guest import | `logic.guest-import`, `frontend.guest-import`, `design.guest-import` | `/admin/list-import`; CSV/XLSX mapping, validation, deduplication, bulk jobs, progress, and recovery from partial failure. |
| RSVP management | `logic.rsvp-management`, `frontend.rsvp-management`, `design.rsvp-management` | `/admin/rsvp-management`, setup, workflow detail; invitations, recipient states, deadlines, reminders, pass release, and delivery history. |
| RSVP customization | `logic.rsvp-customization`, `frontend.rsvp-customization`, `design.rsvp-customization` | `/admin/rsvp-customization`; owner/admin access, page theme assets, uploads, publish flow, and public-RSVP contract. |
| Guest preferences | `logic.preferences`, `frontend.preferences`, `design.preferences` | `/admin/preferences`, preference detail; requirements, response aggregation, vendor totals, deadlines, and guest-specific answers. |
| Seating arrangements | `logic.seating`, `frontend.seating`, `design.seating` | `/admin/seating-plan`, individual plans; sections, tables, assignments, geometry, paths, save behavior, and print/use-on-event-day clarity. |
| Door desk / check-in | `logic.door-desk`, `frontend.door-desk`, `design.door-desk` | `/admin/door-desk`; QR/manual search, check-in idempotency, duplicate arrivals, offline/error recovery, and fast mobile use. |
| Guest messaging | `logic.guest-messaging`, `frontend.guest-messaging`, `design.guest-messaging` | `/admin/guest-messages`; message status, templates, recipient targeting, WhatsApp delivery actions, retry behavior, and privacy. |
| Follow-ups | `logic.follow-ups`, `frontend.follow-ups`, `design.follow-ups` | `/admin/follow-ups`; reminder eligibility, scheduling, cooldowns, send limits, status feedback, and RSVP relationship. |
| Pass studio | `logic.pass-studio`, `frontend.pass-studio`, `design.pass-studio` | `/admin/pass-studio`; pass artwork, QR/name zones, font assets, rendering, preview, download, and accessibility of the editing tools. |
| Message library | `logic.message-library`, `frontend.message-library`, `design.message-library` | `/admin/message-library`; template categories, variable mapping, event context, test sends, and safe template activation. |
| Organization domains | `logic.domains`, `frontend.domains`, `design.domains` | `/admin/domains`; organization-domain ownership, DNS verification, primary selection, public-link behavior, status handling, and setup guidance. |
| Company profile | `logic.company-profile`, `frontend.company-profile`, `design.company-profile` | `/admin/company-profile`; organization identity, edit permissions, validation, save states, and use of profile data across the product. |
| Crew access and roles | `logic.crew-access`, `frontend.crew-access`, `design.crew-access` | `/admin/crew-access`; invitations, membership state, active organization, role changes, removal, and privilege boundaries. |
| Messaging settings | `logic.messaging-settings`, `frontend.messaging-settings`, `design.messaging-settings` | `/admin/settings`; organization overrides, platform defaults, constraints, audit history, and user comprehension of limits. |
| Delivery monitor | `logic.delivery-monitor`, `frontend.delivery-monitor`, `design.delivery-monitor` | `/admin/delivery-monitor`; platform-only queue/worker data, tenant-safe aggregation, refresh behavior, failure diagnosis, and operational hierarchy. |
| Playbook | `logic.playbook`, `frontend.playbook`, `design.playbook` | `/admin/playbook`; role-sensitive operational guidance, navigation, empty/loading behavior, and task-findability. |
| Personal profile | `logic.profile`, `frontend.profile`, `design.profile` | `/admin/profile`; profile updates, password/session safety, organization switching cues, validation, and account-level feedback. |

## Scope-to-source map

Use these source areas in addition to the relevant `frontend/app/admin/<route>`
pages. Do not treat this list as exhaustive; follow imports and API calls.

| Workflow family | Frontend areas | Backend areas |
|---|---|---|
| Event, guests, imports | `components/events`, `components/guests`, `components/bulk-upload`, `lib/api/events.ts`, `lib/api/guests.ts` | `guests/models.py`, `guests/serializers/`, `guests/views/events.py`, `guests/views/guests.py`, `guests/tasks.py` |
| RSVP, follow-ups, customization | `components/rsvp`, `lib/api/rsvp.ts`, `lib/api/reminders.ts`, `lib/api/publicSite.ts` | `rsvp/`, `guests/views/reminders.py`, `guests/requirements.py`, `guests/views/events.py`, `public_sites/` |
| Preferences, seating, door desk | `components/check-in`, `components/ZoneSelector.tsx`, `lib/api/preferences.ts`, `lib/api/seating.ts` | `guests/views/preferences.py`, `guests/views/requirements.py`, `guests/views/seating.py`, `guests/domains/` |
| Messaging and templates | `components/whatsapp`, `lib/api/reminders.ts`, `lib/api/messagingSettings.ts` | `guests/whatsapp.py`, `rsvp/whatsapp.py`, `guests/pacing.py`, `accounts/messaging_*`, `platform_ops/` |
| Organization and access | `components/admin`, `lib/auth.tsx`, `lib/api/auth.ts`, `lib/api/domains.ts` | `accounts/`, `public_sites/`, `platform_ops/` |

## Design-review constraint

For every `design.<workflow>` agent, keep the review strictly within its named
workflow and the shared admin shell. It should assess the actual route in both
desktop and mobile where possible, recommend only relevant transitions, and
avoid redesigning unrelated screens.
