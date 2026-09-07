# Collecting what guests need: Aso Ebi, catering, and whatever comes next

A plan for turning one-off guest questions into a feature event planners can
configure themselves, with dashboards and vendor-ready exports.

Status: implemented through the vendor-service workflow.

The generic requirement models, Aso Ebi backfill, event-level requirement
builder, guest-facing RSVP/preferences collection, option collation, filtered
guest roster, supplier CSV, table-grouped serving plan, complete catering PDF,
and individual table PDF/PNG waiter cards are now built. Structured answers are
also included in the privacy-safe check-in payload; free-text answers and
contact details are deliberately excluded there.

Remaining follow-up from this design: preference deadlines/locking, an optional
answer-change audit history, and organization-level "copy from another event"
convenience if repeated setup becomes a real user pain point.

---

## The problem, stated precisely

Aso Ebi works today, but it is **hardcoded through every layer**:

| Layer | What exists for Aso Ebi |
|---|---|
| Model | `Guest.aso_ebi_requested`, `Guest.aso_ebi_quantity` |
| Event config | `Event.collect_aso_ebi`, plus the new label fields |
| Validation | Hand-written checks in `guests/views/preferences.py` |
| RSVP | Separate handling in `rsvp/views.py` and `rsvp/services.py` |
| Aggregation | `aso_ebi_request_count`, `aso_ebi_quantity` on the event serializer |
| Export | Two fixed columns in the guest CSV |
| UI | A dedicated toggle, a dedicated quantity selector |

**26 files** mention `aso_ebi` by name (10 backend, 16 frontend).

Adding catering the same way means repeating all seven layers. Then dietary
requirements. Then transport, accommodation, table seating, kids' meals. Each
one is a migration, a serializer change, an export change, and new UI — and each
one makes the next harder.

The current design answers "does this event collect Aso Ebi?" It cannot answer
"what does this event need to ask its guests?"

---

## The shape of the fix

Stop modelling *Aso Ebi* and start modelling **a question an event asks its
guests**. Aso Ebi becomes one configured instance of that, not a special case.

### Two new models

**`GuestRequirement`** — a question this event asks. Owned by the event, ordered,
each with a type that determines how it renders and validates.

    event, key, label, help_text, kind, options, unit,
    required, applies_to, collect_on, position, is_active

`applies_to` is `primary` (one answer per invitation, e.g. Aso Ebi) or
`everyone` (each attendee answers, e.g. meal choice). See decision 2.

`kind` covers what real events actually ask:

| Kind | Renders as | Example |
|---|---|---|
| `boolean` | checkbox | "Do you need parking?" |
| `quantity` | number + unit | Aso Ebi — 6 yards |
| `choice` | radio / select | Meal: chicken, fish, vegetarian |
| `multi_choice` | checkboxes | Allergies: nuts, dairy, shellfish |
| `text` | short free text | "Anything we should know?" |

**`GuestRequirementResponse`** — one guest's answer to one requirement.

    guest, requirement, value_bool, value_int, value_text, value_json,
    responded_at, updated_at

Current state only - no history (decision 1). A plus-one is a `Guest` row, so it
gets its own responses with no extra modelling (decision 2).

Typed columns rather than a single JSON blob, so aggregation stays a database
query (`SUM(value_int)` for total yards, `COUNT` grouped by `value_text` for meal
choices) instead of application-side parsing.

### Why not JSON on Guest?

A single `Guest.preferences` JSONField would be quicker to build and worse to
live with: no per-question aggregation without scanning every row, no integrity
(nothing stops `"six"` in a quantity field), no clean per-requirement export, and
reporting logic scattered across the codebase. The typed-response table costs one
extra join and buys correct `GROUP BY` for free.

---

## What planners get

### 1. Requirement builder

In event setup: add a question, choose its kind, set options and unit, mark it
required, choose where it is asked (RSVP page, standalone preferences form, or
both). Aso Ebi is a `quantity` requirement with unit "yards" — nothing more.

Ships with presets so nobody starts from a blank page: **Aso Ebi**, **Meal
choice**, **Dietary requirements**, **Transport**, **Accommodation**.

### 2. A dashboard per requirement

The thing you asked for, and it generalises. For any requirement:

- **Totals that suit the kind** — sum of yards for a quantity; a breakdown by
  option for a choice; counts for a boolean
- **The guest table**: name, phone, response, submitted-at, RSVP status
- **Filters**: responded / not responded, by option, by ticket type, by table
- **Chase list**: guests who have not answered a required question

For Aso Ebi specifically that is exactly the requested view — guest, quantity,
phone number — but the same screen serves catering with no new code.

### 3. Exports built for vendors

The existing streaming CSV in `guest_actions.py` already handles large files
correctly and is worth reusing.

- **Per requirement**: guest, phone, response, quantity — what you hand a tailor
- **Catering summary**: one row per option with headcount — what a caterer wants
- **Combined sheet**: one row per guest, one column per requirement
- Every export respects the filters on screen, so "export what I'm looking at"
  behaves as expected

---

## Migration path

The existing Aso Ebi columns stay and keep working. No rewrite, no risk to a
live product.

1. **Add the models.** Nothing reads them yet.
2. **Backfill.** For each event with `collect_aso_ebi`, create an Aso Ebi
   requirement and one response per guest who requested it. Idempotent, and
   reversible because the old columns are untouched.
3. **Dual-write.** The RSVP and preferences endpoints write both the legacy
   columns and the new responses. Old reads keep working throughout.
4. **Move reads over.** Dashboard, exports, and event stats read the new tables.
   The `aso_ebi_*` serializer fields become computed from responses, so the API
   contract does not break.
5. **Retire the columns** once nothing reads them — a separate, unhurried change.

Steps 1–2 are safe to ship on their own.

---

## Sequencing

| Phase | Delivers | Notes |
|---|---|---|
| 1 | Models, migration, backfill | No UI. Verifiable by data alone. |
| 2 | Requirement builder in event setup | Planners can define questions |
| 3 | Guest-facing rendering (RSVP + preferences) | Dual-write starts here |
| 4 | Dashboard + exports | The requested feature lands |
| 5 | Read migration and cleanup | Legacy columns retired |

Phases 1 and 2 are independent of the rest and can be reviewed separately.

---

## Decisions — settled

These were open questions; they are now answered and the design below reflects them.

### 1. No response history

Answers are current-state only. `GuestRequirementResponse` carries `updated_at`
and nothing more — no audit rows, no previous values. A guest who changes their
meal choice simply overwrites it.

*Consequence:* if a caterer asks "who changed after we ordered?", the system
cannot say. Accepted deliberately. Re-adding history later means a new table, not
a migration of existing data, so this is reversible if it becomes a real problem.

### 2. Plus-ones answer for themselves

**This needs no schema work at all.** A named plus-one is already a full `Guest`
row — created by `upsert_named_plus_one()` with `plus_one_of` pointing at the
primary guest, and carrying its own `full_name`, `phone_number`, and unique
`preference_token`.

So responses attach to a guest, and a plus-one *is* a guest. Both answer
independently, and both appear on vendor exports as their own line — which is
what a caterer needs, since a companion eats their own meal.

Two rules fall out of this:

- `GuestRequirement.applies_to` — `primary` or `everyone`. Aso Ebi is typically
  ordered once per invitation (`primary`); a meal choice is per person
  (`everyone`). Without this, one setting would be wrong for one of them.
- A plus-one created *after* the primary has already answered still needs asking.
  Their `preference_token` link handles this — it just has to be sent.

Exports show the relationship (`invited_as_plus_one_of`), already a column in
the existing guest CSV, so a vendor can see the two are together.

### 3. Requirements are per-event, not reusable

No organisation-level templates. Each event defines its own questions.

Built-in presets (Aso Ebi, meal choice, dietary requirements, transport,
accommodation) still ship, so a planner starts from a sensible default rather
than a blank page — they are starting points copied into the event, not shared
records.

*Consequence:* an organiser running monthly events rebuilds "Meal choice" each
time. If that becomes tedious, "copy requirements from a previous event" is a
small, additive feature — a button, not a re-architecture.

### 4. Vendors get exports, not accounts

No vendor logins, no shared links, no vendor-facing permissions. Planners export
and send the file themselves.

This keeps the whole feature inside the existing permission model and removes
what would otherwise be the largest piece of work. It puts more weight on the
exports being genuinely vendor-ready:

- **Tailor sheet** — guest, phone, quantity, unit. One row per person who asked.
- **Caterer summary** — one row per option with a headcount, plus a second sheet
  listing individuals so dietary needs are traceable to a name.
- **Combined sheet** — one row per guest, one column per requirement, for the
  planner's own working copy.

All three respect on-screen filters, so "export what I am looking at" behaves as
expected.

## What this is not

Not a form builder. Requirements are structured questions with typed answers so
they can be aggregated and exported. Conditional logic, page breaks, and file
uploads are deliberately out of scope; if a planner needs a genuine survey, that
is a different product.
