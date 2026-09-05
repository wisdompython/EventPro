"""Reading and writing guest answers to configured requirements.

Phase 3 of docs/guest-requirements-plan.md. Both guest-facing entry points - the
RSVP page and the standalone preferences form - go through here, so validation
and the legacy dual-write live in one place rather than being written twice.
"""

from django.db import transaction

from .models import GuestRequirement, GuestRequirementResponse

# The requirement key created by migration 0024 from the legacy Aso Ebi columns.
# While both representations exist, writes keep them in step.
ASO_EBI_KEY = 'aso_ebi'


class RequirementError(ValueError):
    """A guest's answers could not be accepted. The message is guest-facing."""


def requirements_for(event, *, collect_on):
    """Active requirements this event asks on a given surface.

    ``collect_on`` is 'rsvp' or 'preferences'; requirements set to 'both' appear
    on either.
    """
    return list(
        GuestRequirement.objects
        .filter(event=event, is_active=True)
        .filter(collect_on__in=[collect_on, GuestRequirement.CollectOn.BOTH])
        .order_by('position', 'id')
    )


def describe_requirements(event, *, collect_on, guest=None):
    """Serialise the questions for a guest-facing page.

    When ``guest`` is given, questions that do not apply to them (a companion
    being asked a per-invitation question) are dropped, and their current answers
    are included so a returning guest sees what they already said.
    """
    requirements = requirements_for(event, collect_on=collect_on)
    if guest is not None:
        requirements = [r for r in requirements if r.applies_to_guest(guest)]

    answers = {}
    if guest is not None and requirements:
        answers = {
            response.requirement_id: response
            for response in GuestRequirementResponse.objects.filter(
                guest=guest, requirement__in=requirements,
            )
        }

    payload = []
    for requirement in requirements:
        response = answers.get(requirement.id)
        payload.append({
            'id': requirement.id,
            'key': requirement.key,
            'label': requirement.label,
            'help_text': requirement.help_text,
            'kind': requirement.kind,
            'options': requirement.options or [],
            'unit': requirement.unit_term if requirement.kind == GuestRequirement.Kind.QUANTITY else '',
            'required': requirement.required,
            'value': _response_value(requirement, response),
        })
    return payload


def _response_value(requirement, response):
    """The stored answer in the shape the client sends it back."""
    if response is None:
        return None
    if requirement.kind == GuestRequirement.Kind.BOOLEAN:
        return response.value_bool
    if requirement.kind == GuestRequirement.Kind.QUANTITY:
        return response.value_int
    if requirement.kind == GuestRequirement.Kind.MULTI_CHOICE:
        return response.value_json or []
    return response.value_text


def _clean_answer(requirement, raw):
    """Validate one answer and return the field to write, or None to clear it.

    Raises RequirementError with wording a guest should see.
    """
    kind = requirement.kind
    label = requirement.label

    if kind == GuestRequirement.Kind.BOOLEAN:
        if raw is None:
            return None
        if not isinstance(raw, bool):
            raise RequirementError(f'{label} must be yes or no.')
        return {'value_bool': raw}

    if kind == GuestRequirement.Kind.QUANTITY:
        if raw is None or raw == '':
            return None
        try:
            quantity = int(raw)
        except (TypeError, ValueError):
            raise RequirementError(f'Enter a number for {label}.')
        if quantity < 1:
            raise RequirementError(
                f'Enter at least 1 {requirement.unit_term.rstrip("s")} for {label}.'
            )
        return {'value_int': quantity}

    if kind == GuestRequirement.Kind.CHOICE:
        if raw is None or raw == '':
            return None
        choice = str(raw).strip()
        if choice not in (requirement.options or []):
            raise RequirementError(f'Choose one of the listed options for {label}.')
        return {'value_text': choice}

    if kind == GuestRequirement.Kind.MULTI_CHOICE:
        if raw is None or raw == []:
            return None
        if not isinstance(raw, list):
            raise RequirementError(f'{label} must be a list of choices.')
        chosen = [str(item).strip() for item in raw if str(item).strip()]
        allowed = set(requirement.options or [])
        invalid = [item for item in chosen if item not in allowed]
        if invalid:
            raise RequirementError(f'Choose only the listed options for {label}.')
        if not chosen:
            return None
        # De-duplicate while keeping the order the guest picked.
        return {'value_json': list(dict.fromkeys(chosen))}

    # TEXT
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    if len(text) > 255:
        raise RequirementError(f'{label} must be 255 characters or fewer.')
    return {'value_text': text}


def clean_requirement_answers(guest, answers, *, collect_on):
    """Validate answers without writing anything.

    Callers that commit other state first (the RSVP endpoint records the response
    before it can save answers) use this to fail early, so a rejected answer
    cannot leave a guest marked as responded.

    Returns ``(applicable_requirements, cleaned)`` for save_requirement_answers
    to reuse.
    """
    if answers is None:
        answers = {}
    if not isinstance(answers, dict):
        raise RequirementError('Answers must be provided as an object.')

    event = guest.event
    applicable = [
        requirement for requirement in requirements_for(event, collect_on=collect_on)
        if requirement.applies_to_guest(guest)
    ]
    by_key = {requirement.key: requirement for requirement in applicable}

    cleaned = {}
    for key, requirement in by_key.items():
        # A key the client omitted is left alone rather than cleared, so a page
        # that only renders some questions cannot wipe the others.
        if key not in answers:
            continue
        cleaned[requirement.id] = (requirement, _clean_answer(requirement, answers[key]))

    for requirement in applicable:
        if not requirement.required:
            continue
        entry = cleaned.get(requirement.id)
        if entry is None:
            # Not supplied now - only an error if there is nothing stored either.
            already = GuestRequirementResponse.objects.filter(
                guest=guest, requirement=requirement,
            ).first()
            if already is not None and already.has_answer:
                continue
            raise RequirementError(f'{requirement.label} is required.')
        if entry[1] is None:
            raise RequirementError(f'{requirement.label} is required.')

    return applicable, cleaned


@transaction.atomic
def save_requirement_answers(guest, answers, *, collect_on):
    """Validate and persist a guest's answers.

    ``answers`` maps requirement key -> value, as sent by the client. Unknown
    keys are ignored so an outdated page cannot write to questions that have
    since been removed.
    """
    applicable, cleaned = clean_requirement_answers(
        guest, answers, collect_on=collect_on,
    )
    by_key = {requirement.key: requirement for requirement in applicable}

    for requirement, fields in cleaned.values():
        if fields is None:
            GuestRequirementResponse.objects.filter(
                guest=guest, requirement=requirement,
            ).delete()
            continue
        defaults = {
            'value_bool': None, 'value_int': None, 'value_text': '', 'value_json': [],
        }
        defaults.update(fields)
        GuestRequirementResponse.objects.update_or_create(
            guest=guest, requirement=requirement, defaults=defaults,
        )

    # Only re-sync when this submission actually touched the Aso Ebi answer.
    # Syncing on every save would clear the legacy columns whenever a guest
    # answered some unrelated question, because a page that does not render the
    # fabric question sends no value for it.
    aso_ebi = by_key.get(ASO_EBI_KEY)
    if aso_ebi is not None and aso_ebi.id in cleaned:
        _sync_legacy_aso_ebi(guest, aso_ebi)
    return applicable


def _sync_legacy_aso_ebi(guest, requirement):
    """Keep Guest.aso_ebi_* in step with the Aso Ebi requirement.

    Phase 4 moves reads onto the new tables and Phase 5 drops these columns; until
    then the old fields still drive exports, event stats and the pass artwork, so
    they must not drift.
    """
    if requirement is None:
        return

    response = GuestRequirementResponse.objects.filter(
        guest=guest, requirement=requirement,
    ).first()
    quantity = response.value_int if response and response.value_int else 0
    requested = bool(quantity)

    if guest.aso_ebi_requested == requested and guest.aso_ebi_quantity == quantity:
        return
    guest.aso_ebi_requested = requested
    guest.aso_ebi_quantity = quantity
    guest.save(update_fields=['aso_ebi_requested', 'aso_ebi_quantity'])
