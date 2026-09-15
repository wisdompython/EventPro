from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from django.utils.text import slugify
from django.db.models import Count, Q, Sum
from rest_framework import serializers
from ..models import Event, EventLocation, Font, GuestRequirement
from accounts.tenancy import get_request_organization
from ..domains.seating import create_initial_seating_setup

# Guest fields that can be toggled required/optional per event
CONFIGURABLE_FIELDS = ['full_name', 'phone_number', 'email', 'table_number', 'seat_number']

# Absolute minimum — full_name is always required regardless of event config
ALWAYS_REQUIRED = {'full_name'}


class EventLocationSerializer(serializers.ModelSerializer):
    """One stop in an event's schedule, as sent to and from the client."""

    class Meta:
        model = EventLocation
        fields = ('id', 'name', 'venue', 'starts_at', 'sort_order')
        read_only_fields = ('id',)


def _event_required_fields(event: Event) -> set:
    """Return the set of required field names for this event."""
    configured = set(event.required_fields or [])
    # full_name is non-negotiable
    configured |= ALWAYS_REQUIRED
    # if WhatsApp is enabled, phone_number is implicitly required unless already listed
    if event.whatsapp_enabled and 'phone_number' not in configured:
        configured.add('phone_number')
    return configured


def _event_valid_ticket_values(event: Event) -> list:
    """Return list of allowed ticket_type values for this event."""
    return [t['value'] for t in (event.ticket_types or []) if isinstance(t, dict) and 'value' in t]


class FontSerializer(serializers.ModelSerializer):
    class Meta:
        model = Font
        fields = ('id', 'name', 'file', 'uploaded_at')
        read_only_fields = ('id', 'uploaded_at')

    def validate_name(self, value):
        request = self.context.get('request')
        if request is None:
            return value.strip()
        organization = get_request_organization(request, required=True)
        matches = Font.objects.filter(organization=organization, name__iexact=value.strip())
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError('A font with this name already exists in this workspace.')
        return value.strip()


class EventSerializer(serializers.ModelSerializer):
    guest_count = serializers.SerializerMethodField()
    checked_in_count = serializers.SerializerMethodField()
    plus_one_count = serializers.SerializerMethodField()
    estimated_guest_count = serializers.SerializerMethodField()
    confirmed_count = serializers.SerializerMethodField()
    plus_one_checked_in_count = serializers.SerializerMethodField()
    total_checked_in_count = serializers.SerializerMethodField()
    aso_ebi_request_count = serializers.SerializerMethodField()
    aso_ebi_quantity = serializers.SerializerMethodField()
    preferences_submitted_count = serializers.SerializerMethodField()
    celebrant_breakdown = serializers.SerializerMethodField()
    name_font_name = serializers.CharField(source='name_font.name', read_only=True)
    whatsapp_template_name = serializers.CharField(source='whatsapp_template.display_name', read_only=True)
    create_rsvp_workflow = serializers.BooleanField(write_only=True, required=False, default=False)
    locations = EventLocationSerializer(many=True, read_only=True)
    # Write side is a plain JSON list so the form can send the whole schedule
    # in one field alongside its multipart upload, matching seating_setup.
    locations_setup = serializers.JSONField(write_only=True, required=False, default=None)
    seating_setup = serializers.JSONField(write_only=True, required=False, default=list)
    requirements_setup = serializers.JSONField(write_only=True, required=False, default=list)
    rsvp_workflow_id = serializers.SerializerMethodField()

    def get_guest_count(self, obj):
        # Use annotation when available (list view), fall back for single-object endpoints.
        ann = getattr(obj, 'guest_count_ann', None)
        return ann if ann is not None else obj.guests.count()

    def get_checked_in_count(self, obj):
        ann = getattr(obj, 'checked_in_count_ann', None)
        return ann if ann is not None else obj.guests.filter(status='checked_in').count()

    def get_plus_one_count(self, obj):
        if not obj.allow_plus_one:
            return 0
        if obj.rsvp_enabled:
            return self._planning_aggregate(obj)['plus_ones']
        named = obj.guests.filter(plus_one_of__isnull=False).count()
        legacy = obj.guests.filter(
            plus_one_attending=True,
            plus_one_of__isnull=True,
            named_plus_one__isnull=True,
        ).count()
        return named + legacy

    def get_estimated_guest_count(self, obj):
        if obj.rsvp_enabled:
            planning = self._planning_aggregate(obj)
            return planning['primary'] + planning['plus_ones']
        # Named plus one entries are real guest records and are already part
        # of guest_count. Only legacy anonymous plus one flags need adding.
        legacy = obj.guests.filter(
            plus_one_attending=True,
            plus_one_of__isnull=True,
            named_plus_one__isnull=True,
        ).count()
        return self.get_guest_count(obj) + legacy

    def _planning_guests(self, obj):
        guests = obj.guests.all()
        if obj.rsvp_enabled:
            guests = guests.filter(
                rsvp_recipients__workflow__event=obj,
                rsvp_recipients__response_status='confirmed',
            )
        return guests

    def _planning_aggregate(self, obj):
        cached = getattr(obj, '_planning_aggregate_cache', None)
        if cached is None:
            cached = self._planning_guests(obj).aggregate(
                confirmed=Count('id', distinct=True),
                primary=Count('id', filter=Q(plus_one_of__isnull=True), distinct=True),
                plus_ones=Count(
                    'id',
                    filter=Q(
                        plus_one_of__isnull=True,
                        plus_one_attending=True,
                    ),
                    distinct=True,
                ),
                aso_ebi_requests=Count('id', filter=Q(aso_ebi_requested=True), distinct=True),
                aso_ebi_quantity=Sum(
                    'aso_ebi_quantity', filter=Q(aso_ebi_requested=True), default=0,
                ),
            )
            obj._planning_aggregate_cache = cached
        return cached

    def get_confirmed_count(self, obj):
        return self._planning_aggregate(obj)['confirmed'] if obj.rsvp_enabled else 0

    def get_plus_one_checked_in_count(self, obj):
        named = obj.guests.filter(
            plus_one_of__isnull=False,
            status='checked_in',
        ).count()
        legacy = obj.guests.filter(
            plus_one_checked_in=True,
            named_plus_one__isnull=True,
        ).count()
        return named + legacy

    def get_total_checked_in_count(self, obj):
        legacy = obj.guests.filter(
            plus_one_checked_in=True,
            named_plus_one__isnull=True,
        ).count()
        return self.get_checked_in_count(obj) + legacy

    def get_aso_ebi_request_count(self, obj):
        return self._planning_aggregate(obj)['aso_ebi_requests']

    def get_aso_ebi_quantity(self, obj):
        return self._planning_aggregate(obj)['aso_ebi_quantity']

    def get_preferences_submitted_count(self, obj):
        return obj.guests.filter(preferences_submitted_at__isnull=False).count()

    def get_celebrant_breakdown(self, obj):
        if not obj.collect_celebrant:
            return []
        rows = (
            self._planning_guests(obj)
            .exclude(celebrant_name='')
            .values('celebrant_name')
            .annotate(
                guests=Count('id', filter=Q(plus_one_of__isnull=True), distinct=True),
                plus_ones=Count(
                    'id',
                    filter=Q(plus_one_of__isnull=True, plus_one_attending=True),
                    distinct=True,
                ),
            )
            .order_by('-guests', 'celebrant_name')
        )
        return [
            {
                'name': row['celebrant_name'],
                'guests': row['guests'],
                'plus_ones': row['plus_ones'],
                'estimated_guests': row['guests'] + row['plus_ones'],
            }
            for row in rows
        ]

    def get_rsvp_workflow_id(self, obj):
        try:
            return obj.rsvp_workflow.id
        except ObjectDoesNotExist:
            return None

    class Meta:
        model = Event
        fields = (
            'id', 'name', 'date', 'venue', 'description', 'rsvp_message', 'color_of_day',
            'locations', 'locations_setup',
            'rsvp_primary_color', 'rsvp_background_color', 'rsvp_card_color',
            'rsvp_text_color', 'rsvp_background_image',
            'design_template',
            'qr_zone_x', 'qr_zone_y', 'qr_zone_w', 'qr_zone_h',
            'name_zone_x', 'name_zone_y', 'name_zone_w', 'name_zone_h',
            'name_font', 'name_font_name', 'name_font_color', 'name_font_size_fraction',
            'qr_bg_color',
            'ticket_types', 'required_fields', 'collect_aso_ebi', 'allow_plus_one',
            'plus_one_label', 'aso_ebi_label', 'aso_ebi_unit',
            'plus_one_term', 'aso_ebi_term', 'aso_ebi_unit_term',
            'preferences_enabled', 'preferences_deadline',
            'collect_celebrant', 'celebrant_options', 'whatsapp_enabled',
            'seating_plan_width', 'seating_plan_height',
            'rsvp_enabled',
            'whatsapp_template', 'whatsapp_template_name',
            'pass_send_at', 'create_rsvp_workflow', 'rsvp_workflow_id',
            'seating_setup', 'requirements_setup',
            'is_ended', 'guest_count', 'confirmed_count', 'checked_in_count',
            'plus_one_count', 'plus_one_checked_in_count', 'total_checked_in_count',
            'estimated_guest_count', 'aso_ebi_request_count', 'aso_ebi_quantity',
            'preferences_submitted_count', 'celebrant_breakdown', 'created_at',
        )
        read_only_fields = ('id', 'created_at', 'name_font_name', 'whatsapp_template_name', 'plus_one_term', 'aso_ebi_term', 'aso_ebi_unit_term',)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            organization = get_request_organization(request, required=True)
            name_font = attrs.get('name_font')
            if name_font and name_font.organization_id != organization.id:
                raise serializers.ValidationError({'name_font': 'Font not found.'})
            whatsapp_template = attrs.get('whatsapp_template')
            if whatsapp_template and whatsapp_template.organization_id != organization.id:
                raise serializers.ValidationError({'whatsapp_template': 'Template not found.'})
        for field in (
            'rsvp_primary_color', 'rsvp_background_color',
            'rsvp_card_color', 'rsvp_text_color',
        ):
            value = attrs.get(field, getattr(self.instance, field, '') if self.instance else '')
            if value and (
                len(value) != 7
                or not value.startswith('#')
                or any(char not in '0123456789abcdefABCDEF' for char in value[1:])
            ):
                raise serializers.ValidationError({
                    field: 'Enter a six-digit hex colour such as #8a6f2b.',
                })
        for field, minimum in (
            ('seating_plan_width', 1400),
            ('seating_plan_height', 950),
        ):
            value = attrs.get(field, getattr(self.instance, field, minimum) if self.instance else minimum)
            if value < minimum or value > 5000:
                raise serializers.ValidationError({
                    field: f'Use a value between {minimum} and 5000.',
                })
        event_date = attrs.get('date') or (self.instance.date if self.instance else None)
        pass_send_at = attrs.get(
            'pass_send_at',
            self.instance.pass_send_at if self.instance else None,
        )
        if pass_send_at and pass_send_at <= timezone.now():
            raise serializers.ValidationError({
                'pass_send_at': 'The scheduled pass time must be in the future.',
            })
        if pass_send_at and event_date and pass_send_at >= event_date:
            raise serializers.ValidationError({
                'pass_send_at': 'The scheduled pass time must be before the event date.',
            })

        preferences_enabled = attrs.get(
            'preferences_enabled',
            self.instance.preferences_enabled if self.instance else False,
        )
        rsvp_enabled = attrs.get(
            'rsvp_enabled',
            self.instance.rsvp_enabled if self.instance else False,
        )
        preferences_deadline = attrs.get(
            'preferences_deadline',
            self.instance.preferences_deadline if self.instance else None,
        )
        if preferences_enabled and rsvp_enabled:
            raise serializers.ValidationError({
                'preferences_enabled': 'Use RSVP collection or a standalone preferences form, not both.',
            })
        if preferences_enabled and not preferences_deadline:
            raise serializers.ValidationError({
                'preferences_deadline': 'Set a deadline for standalone preference submissions.',
            })
        if preferences_deadline and event_date and preferences_deadline >= event_date:
            raise serializers.ValidationError({
                'preferences_deadline': 'The preferences deadline must be before the event date.',
            })
        deadline_changed = not self.instance or preferences_deadline != self.instance.preferences_deadline
        if preferences_enabled and deadline_changed and preferences_deadline <= timezone.now():
            raise serializers.ValidationError({
                'preferences_deadline': 'The preferences deadline must be in the future.',
            })
        if not preferences_enabled:
            attrs['preferences_deadline'] = None
        if attrs.get('requirements_setup') and not (
            preferences_enabled or rsvp_enabled or attrs.get('create_rsvp_workflow')
        ):
            raise serializers.ValidationError({
                'requirements_setup': 'Choose RSVP or standalone preferences before adding guest questions.',
            })
        return attrs

    def validate_rsvp_background_image(self, value):
        if value.size > 8 * 1024 * 1024:
            raise serializers.ValidationError('The RSVP background must be 8 MB or smaller.')
        content_type = getattr(value, 'content_type', '')
        if content_type and content_type not in {'image/jpeg', 'image/png', 'image/webp'}:
            raise serializers.ValidationError('Upload a PNG, JPEG, or WebP background image.')
        return value

    def validate_locations_setup(self, value):
        """Validate the schedule an organiser built in the event form.

        None means "not submitted" — the event's locations are left alone. An
        empty list means "the organiser removed them all", which is a real
        instruction and must clear the existing rows.
        """
        if value is None or value == '':
            return None
        if isinstance(value, str):
            import json
            try:
                value = json.loads(value)
            except ValueError:
                raise serializers.ValidationError('Locations must be a list.')
        if not isinstance(value, list):
            raise serializers.ValidationError('Locations must be a list.')
        if len(value) > 10:
            raise serializers.ValidationError('Add no more than 10 locations to one event.')

        cleaned = []
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError('Each location must be an object.')
            name = str(item.get('name', '')).strip()
            venue = str(item.get('venue', '')).strip()
            starts_at = item.get('starts_at') or None
            # A row with nothing in it is a half-finished repeater entry, not
            # an error — drop it rather than blocking the whole save.
            if not name and not venue and not starts_at:
                continue
            if not name:
                raise serializers.ValidationError(
                    'Give every location a name, such as "Church" or "Reception".'
                )
            if starts_at:
                parsed = serializers.DateTimeField().to_internal_value(starts_at)
            else:
                parsed = None
            cleaned.append({'name': name[:120], 'venue': venue[:255], 'starts_at': parsed})
        return cleaned

    def _apply_locations(self, event, locations):
        """Replace the event's schedule with `locations`, preserving order.

        Replace rather than merge: the form submits the whole schedule every
        time, so a row the organiser deleted must disappear.
        """
        event.locations.all().delete()
        if not locations:
            return
        EventLocation.objects.bulk_create([
            EventLocation(
                event=event,
                name=item['name'],
                venue=item['venue'],
                starts_at=item['starts_at'],
                sort_order=position,
            )
            for position, item in enumerate(locations)
        ])

    @transaction.atomic
    def create(self, validated_data):
        create_rsvp_workflow = validated_data.pop('create_rsvp_workflow', False)
        locations_setup = validated_data.pop('locations_setup', None)
        seating_setup = validated_data.pop('seating_setup', [])
        requirements_setup = validated_data.pop('requirements_setup', [])
        if create_rsvp_workflow:
            validated_data['rsvp_enabled'] = True
            validated_data['preferences_enabled'] = False
            validated_data['pass_send_at'] = None
        event = super().create(validated_data)
        if locations_setup is not None:
            self._apply_locations(event, locations_setup)
        if seating_setup:
            create_initial_seating_setup(event, seating_setup)
        if requirements_setup:
            collect_on = (
                GuestRequirement.CollectOn.RSVP
                if event.rsvp_enabled
                else GuestRequirement.CollectOn.PREFERENCES
            )
            GuestRequirement.objects.bulk_create([
                GuestRequirement(
                    event=event,
                    position=position,
                    collect_on=collect_on,
                    **requirement,
                )
                for position, requirement in enumerate(requirements_setup)
            ])
        if create_rsvp_workflow:
            from rsvp.models import RsvpWorkflow

            request = self.context.get('request')
            created_by = request.user if request and request.user.is_authenticated else None
            RsvpWorkflow.objects.create(event=event, created_by=created_by)
        return event

    @transaction.atomic
    def update(self, instance, validated_data):
        locations_setup = validated_data.pop('locations_setup', None)
        # These are create-only; ignore them on edit rather than re-running
        # setup and duplicating an event's tables or requirements.
        validated_data.pop('seating_setup', None)
        validated_data.pop('requirements_setup', None)
        validated_data.pop('create_rsvp_workflow', None)
        event = super().update(instance, validated_data)
        if locations_setup is not None:
            self._apply_locations(event, locations_setup)
        return event

    def validate_seating_setup(self, value):
        if value in (None, ''):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('Seating setup must be a list of seating areas.')
        if len(value) > 20:
            raise serializers.ValidationError('Create no more than 20 seating areas at once.')
        cleaned = []
        names = set()
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError('Each seating area must be an object.')
            name = str(item.get('name', '')).strip()
            if not name:
                raise serializers.ValidationError('Every seating area needs a name.')
            if name.casefold() in names:
                raise serializers.ValidationError(f'The seating area "{name}" is repeated.')
            names.add(name.casefold())
            try:
                table_count = int(item.get('table_count', 1))
                seats_per_table = int(item.get('seats_per_table', 8))
            except (TypeError, ValueError):
                raise serializers.ValidationError('Table and seat counts must be whole numbers.')
            if not 1 <= table_count <= 60:
                raise serializers.ValidationError(f'{name} must contain between 1 and 60 tables.')
            if not 1 <= seats_per_table <= 60:
                raise serializers.ValidationError(f'Tables in {name} must seat between 1 and 60 guests.')
            shape = item.get('shape', 'round')
            if shape not in {'round', 'rectangle'}:
                raise serializers.ValidationError(f'{name} has an invalid table shape.')
            cleaned.append({
                'name': name,
                'prefix': str(item.get('prefix', '')).strip()[:8],
                'table_count': table_count,
                'seats_per_table': seats_per_table,
                'shape': shape,
                'is_reserved': bool(item.get('is_reserved', False)),
            })
        return cleaned

    def validate_requirements_setup(self, value):
        if value in (None, ''):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('Guest questions must be a list.')
        if len(value) > 30:
            raise serializers.ValidationError('Create no more than 30 guest questions at once.')

        valid_kinds = {choice for choice, _label in GuestRequirement.Kind.choices}
        valid_applies_to = {choice for choice, _label in GuestRequirement.AppliesTo.choices}
        kinds_with_options = {
            GuestRequirement.Kind.CHOICE,
            GuestRequirement.Kind.MULTI_CHOICE,
        }
        cleaned = []
        used_keys = set()
        for index, item in enumerate(value, start=1):
            if not isinstance(item, dict):
                raise serializers.ValidationError(f'Question {index} must be an object.')
            label = str(item.get('label', '')).strip()
            if not label:
                raise serializers.ValidationError(f'Question {index} needs a label.')
            if len(label) > 120:
                raise serializers.ValidationError(f'Question {index} is too long.')
            key = slugify(str(item.get('key', '')).strip() or label).replace('-', '_')[:50]
            if not key:
                raise serializers.ValidationError(f'Question {index} needs a usable label.')
            if key in used_keys:
                raise serializers.ValidationError(f'The question key "{key}" is repeated.')
            used_keys.add(key)

            kind = item.get('kind')
            if kind not in valid_kinds:
                raise serializers.ValidationError(f'Question {index} has an invalid answer type.')
            applies_to = item.get('applies_to', GuestRequirement.AppliesTo.EVERYONE)
            if applies_to not in valid_applies_to:
                raise serializers.ValidationError(f'Question {index} has an invalid audience.')
            required = item.get('required', False)
            if not isinstance(required, bool):
                raise serializers.ValidationError(f'Question {index} required must be true or false.')

            raw_options = item.get('options', [])
            if not isinstance(raw_options, list):
                raise serializers.ValidationError(f'Question {index} options must be a list.')
            options = [str(option).strip() for option in raw_options if str(option).strip()]
            if len(options) != len(set(options)):
                raise serializers.ValidationError(f'Question {index} options must be different.')
            if kind in kinds_with_options and not options:
                raise serializers.ValidationError(f'Question {index} needs at least one option.')
            if kind not in kinds_with_options:
                options = []

            unit = str(item.get('unit', '')).strip()
            if kind != GuestRequirement.Kind.QUANTITY:
                unit = ''
            cleaned.append({
                'key': key,
                'label': label,
                'help_text': str(item.get('help_text', '')).strip()[:255],
                'kind': kind,
                'options': options,
                'unit': unit[:20],
                'required': required,
                'applies_to': applies_to,
            })
        return cleaned

    def validate_ticket_types(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("ticket_types must be a list.")
        for item in value:
            if not isinstance(item, dict) or 'value' not in item or 'label' not in item:
                raise serializers.ValidationError(
                    "Each ticket type must be an object with 'value' and 'label' keys."
                )
            if not str(item['value']).strip():
                raise serializers.ValidationError("Ticket type 'value' cannot be empty.")
        return value

    def validate_required_fields(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("required_fields must be a list.")
        invalid = set(value) - set(CONFIGURABLE_FIELDS)
        if invalid:
            raise serializers.ValidationError(
                f"Unknown field(s): {', '.join(invalid)}. Allowed: {', '.join(CONFIGURABLE_FIELDS)}"
            )
        return value

    def validate_celebrant_options(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('celebrant_options must be a list.')
        cleaned = []
        seen = set()
        for item in value:
            name = str(item).strip()
            key = name.casefold()
            if name and key not in seen:
                cleaned.append(name)
                seen.add(key)
        return cleaned
