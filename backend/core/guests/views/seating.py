"""Seating plan API.

Planners build a room out of sections — "High table", "Grooms family" — each
holding however many tables that part of the room needs. Guests are seated at
a table by writing Guest.table_number, so check-in, passes and exports keep
reading the field they already read.
"""

import re

from django.db import transaction
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsEventManagerOrAbove
from accounts.tenancy import get_request_organization

from ..domains import seating as seating_service
from ..models import Event, SeatingSection, SeatingTable


# Layout constants, in plan units. The client uses the same numbers so a
# section occupies the space the server said it would.
TABLE_STEP_X = 150
TABLE_STEP_Y = 150


def derive_prefix(name: str) -> str:
    """Build a short table-label prefix from a section name.

    "Grooms family" -> GF, "Sponsors" -> SPO, "High table" -> HT. Initials for
    multi-word names, otherwise the first few letters.
    """
    parts = [word for word in re.split(r'[^A-Za-z0-9]+', name) if word]
    # Drop one-letter fragments so a possessive ("Bride's side") does not
    # contribute a stray initial.
    words = [word for word in parts if len(word) > 1] or parts
    if not words:
        return 'S'
    if len(words) >= 2:
        return ''.join(word[0] for word in words[:3]).upper()
    return words[0][:3].upper()


def unique_prefix(event_id: int, base: str, exclude_pk=None) -> str:
    """Make a prefix that no other section on this event is using."""
    base = (base or 'S').upper()[:8]
    candidate = base
    suffix = 2
    while True:
        clash = SeatingSection.objects.filter(event_id=event_id, prefix=candidate)
        if exclude_pk is not None:
            clash = clash.exclude(pk=exclude_pk)
        if not clash.exists():
            return candidate
        candidate = f'{base[:6]}{suffix}'
        suffix += 1


def layout_position(index: int, columns: int) -> tuple[float, float]:
    """Where the nth table sits inside its section."""
    columns = max(1, columns)
    return (
        (index % columns) * TABLE_STEP_X,
        (index // columns) * TABLE_STEP_Y,
    )


class SeatingTableSerializer(serializers.ModelSerializer):
    # Annotated in bulk by the list path; falls back to counting for a single
    # write, so `assigned` is never missing from a response.
    assigned = serializers.SerializerMethodField()

    class Meta:
        model = SeatingTable
        fields = [
            'id', 'section', 'event', 'label', 'shape', 'seats',
            'x', 'y', 'position', 'created_at', 'assigned',
        ]
        read_only_fields = ['id', 'event', 'created_at', 'assigned']
        # The (event, label) constraint would otherwise surface as a
        # non_field_errors message. validate() raises it against `label`
        # instead, so the builder can show the error on the field being edited.
        validators = []

    def get_assigned(self, obj) -> int:
        annotated = getattr(obj, 'assigned_total', None)
        if annotated is not None:
            return annotated
        return obj.assigned_count

    def validate_label(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError('Give the table a label.')
        return cleaned

    def validate_seats(self, value):
        if value < 1 or value > 60:
            raise serializers.ValidationError('A table seats between 1 and 60 guests.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')

        section = attrs.get('section') or (self.instance.section if self.instance else None)
        if request and section:
            organization = get_request_organization(request, required=True)
            if section.event.organization_id != organization.id:
                raise serializers.ValidationError({'section': 'Section not found.'})

        label = attrs.get('label') or (self.instance.label if self.instance else None)
        event_id = section.event_id if section else None
        if event_id and label:
            clash = SeatingTable.objects.filter(event_id=event_id, label=label)
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError(
                    {'label': 'Another table on this plan already uses that label.'},
                )

        return attrs

    def create(self, validated_data):
        # event is denormalised from the section rather than trusted from input.
        validated_data['event'] = validated_data['section'].event
        return super().create(validated_data)


class SeatingSectionSerializer(serializers.ModelSerializer):
    tables = SeatingTableSerializer(many=True, read_only=True)
    # Write-only convenience: create a section and its tables in one request.
    table_count = serializers.IntegerField(
        write_only=True, required=False, min_value=0, max_value=60,
    )
    seats_per_table = serializers.IntegerField(
        write_only=True, required=False, min_value=1, max_value=60,
    )
    shape = serializers.ChoiceField(
        choices=SeatingTable.Shape.choices, write_only=True, required=False,
    )
    # Derived from the name when the planner does not supply one.
    prefix = serializers.CharField(max_length=8, required=False, allow_blank=True)

    class Meta:
        model = SeatingSection
        fields = [
            'id', 'event', 'name', 'kind', 'feature', 'prefix',
            'x', 'y', 'width', 'height', 'path_points', 'path_arrows',
            'path_start_section', 'path_end_section',
            'path_start_table', 'path_end_table',
            'columns', 'is_reserved', 'note', 'position', 'created_at', 'tables',
            'table_count', 'seats_per_table', 'shape',
        ]
        read_only_fields = ['id', 'created_at', 'tables']
        validators = []

    def validate_name(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError('Give the section a name.')
        return cleaned

    def validate_path_points(self, value):
        """Keep route geometry compact, numeric, and inside its own box."""
        if value == []:
            return value
        if not isinstance(value, list) or not 2 <= len(value) <= 16:
            raise serializers.ValidationError('A route needs 2 to 16 points.')

        cleaned = []
        for point in value:
            if not isinstance(point, dict) or 'x' not in point or 'y' not in point:
                raise serializers.ValidationError('Each route point needs x and y coordinates.')
            try:
                x = float(point['x'])
                y = float(point['y'])
            except (TypeError, ValueError):
                raise serializers.ValidationError('Route coordinates must be numbers.')
            if not 0 <= x <= 1 or not 0 <= y <= 1:
                raise serializers.ValidationError('Route coordinates must stay between 0 and 1.')
            cleaned.append({'x': round(x, 4), 'y': round(y, 4)})
        return cleaned

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')

        event = attrs.get('event') or (self.instance.event if self.instance else None)
        if request and event:
            organization = get_request_organization(request, required=True)
            if event.organization_id != organization.id:
                # Same wording as a missing event, so this cannot be used to
                # probe for events in other organisations.
                raise serializers.ValidationError({'event': 'Event not found.'})

        # A connector may only anchor to blocks on the same event, or a route
        # could be pinned to another organisation's furniture.
        for field in ('path_start_section', 'path_end_section',
                      'path_start_table', 'path_end_table'):
            anchor = attrs.get(field)
            if anchor is not None and event is not None and anchor.event_id != event.id:
                raise serializers.ValidationError(
                    {field: 'That block is on a different event.'},
                )
        # A route anchored to itself would chase its own position for ever.
        if self.instance is not None:
            for field in ('path_start_section', 'path_end_section'):
                anchor = attrs.get(field)
                if anchor is not None and anchor.pk == self.instance.pk:
                    raise serializers.ValidationError(
                        {field: 'A route cannot connect to itself.'},
                    )

        name = attrs.get('name') or (self.instance.name if self.instance else None)
        if event and name:
            clash = SeatingSection.objects.filter(event=event, name=name)
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError(
                    {'name': 'This plan already has a section with that name.'},
                )

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        table_count = validated_data.pop('table_count', 0)
        seats_per_table = validated_data.pop('seats_per_table', 8)
        shape = validated_data.pop('shape', SeatingTable.Shape.ROUND)

        event = validated_data['event']
        is_feature = validated_data.get('kind') == SeatingSection.Kind.FEATURE
        if is_feature:
            # Nobody is seated at a walkway, so it carries no label prefix and
            # no tables however the request was filled in.
            validated_data['prefix'] = ''
            table_count = 0
            if (
                validated_data.get('feature') == SeatingSection.Feature.PATH
                and not validated_data.get('path_points')
            ):
                validated_data['path_points'] = [
                    {'x': 0.04, 'y': 0.5},
                    {'x': 0.5, 'y': 0.5},
                    {'x': 0.96, 'y': 0.5},
                ]
        else:
            supplied_prefix = (validated_data.get('prefix') or '').strip()
            validated_data['prefix'] = unique_prefix(
                event.id, supplied_prefix or derive_prefix(validated_data['name']),
            )
        # New sections stack down the plan rather than landing on each other.
        if 'position' not in validated_data:
            validated_data['position'] = SeatingSection.objects.filter(event=event).count()

        section = super().create(validated_data)

        if table_count:
            columns = section.columns or 3
            SeatingTable.objects.bulk_create([
                SeatingTable(
                    section=section,
                    event=event,
                    label=f'{section.prefix}-{index + 1:02d}',
                    shape=shape,
                    seats=seats_per_table,
                    x=layout_position(index, columns)[0],
                    y=layout_position(index, columns)[1],
                    position=index,
                )
                for index in range(table_count)
            ])
        return section

    def update(self, instance, validated_data):
        # These only mean anything at creation time.
        validated_data.pop('table_count', None)
        validated_data.pop('seats_per_table', None)
        validated_data.pop('shape', None)

        kind = validated_data.get('kind', instance.kind)
        if kind == SeatingSection.Kind.FEATURE:
            validated_data['prefix'] = ''
            return super().update(instance, validated_data)

        prefix = validated_data.get('prefix')
        if prefix is not None:
            validated_data['prefix'] = unique_prefix(
                instance.event_id, prefix.strip() or derive_prefix(
                    validated_data.get('name', instance.name),
                ),
                exclude_pk=instance.pk,
            )
        return super().update(instance, validated_data)


class SeatingSectionViewSet(viewsets.ModelViewSet):
    """Sections of an event's seating plan, each holding its tables.

    Scoped to the active organisation through the event, so an id from another
    organisation is simply not found.
    """

    serializer_class = SeatingSectionSerializer
    permission_classes = [IsEventManagerOrAbove]
    pagination_class = None  # A plan is loaded whole; paging it would split the canvas.

    def get_queryset(self):
        organization = get_request_organization(self.request, required=True)
        qs = (
            SeatingSection.objects
            .filter(event__organization=organization)
            .select_related('event')
            .prefetch_related('tables')
            .order_by('position', 'id')
        )
        event_id = self.request.query_params.get('event')
        if event_id:
            qs = qs.filter(event_id=event_id)
        return qs

    def _annotate_assigned(self, sections, event_id):
        """Attach guest counts to every table without a query per table."""
        counts = seating_service.seat_counts_for_event(event_id)
        for section in sections:
            for table in section.tables.all():
                table.assigned_total = counts.get(table.label, 0)
        return sections

    def list(self, request, *args, **kwargs):
        sections = list(self.filter_queryset(self.get_queryset()))
        event_id = request.query_params.get('event')
        if event_id:
            self._annotate_assigned(sections, event_id)
        return Response(self.get_serializer(sections, many=True).data)

    @action(detail=False, methods=['post'])
    def positions(self, request):
        """Persist a drag of whole sections and/or individual tables.

        Takes {"event": id, "sections": [{id, x, y}], "tables": [{id, x, y}]}
        and writes both in one round trip. Ids outside the event are ignored
        rather than erroring, so a stale tab cannot move another event's plan.
        """
        event_id = request.data.get('event')
        if not event_id:
            return Response(
                {'detail': 'Provide an event.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organization = get_request_organization(request, required=True)
        if not Event.objects.filter(pk=event_id, organization=organization).exists():
            return Response({'detail': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)

        updated = 0
        for key, model, field in (
            ('sections', SeatingSection, 'sections'),
            ('tables', SeatingTable, 'tables'),
        ):
            entries = request.data.get(key)
            if not isinstance(entries, list) or not entries:
                continue
            rows = {row.id: row for row in model.objects.filter(event_id=event_id)}
            to_update = []
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                row = rows.get(entry.get('id'))
                if row is None:
                    continue
                try:
                    x = float(entry.get('x', row.x))
                    y = float(entry.get('y', row.y))
                except (TypeError, ValueError):
                    continue
                changed = row.x != x or row.y != y
                row.x = x
                row.y = y
                # Sections may also be resized in the same gesture.
                if model is SeatingSection:
                    for dimension in ('width', 'height'):
                        if dimension in entry:
                            try:
                                value = float(entry[dimension])
                            except (TypeError, ValueError):
                                continue
                            if getattr(row, dimension) != value:
                                setattr(row, dimension, value)
                                changed = True
                if changed:
                    to_update.append(row)
            if to_update:
                fields = ['x', 'y'] + (['width', 'height'] if model is SeatingSection else [])
                model.objects.bulk_update(to_update, fields)
                updated += len(to_update)

        return Response({'updated': updated})

    @action(detail=True, methods=['post'])
    def add_tables(self, request, pk=None):
        """Append more tables to an existing section."""
        section = self.get_object()
        if section.kind == SeatingSection.Kind.FEATURE:
            return Response(
                {'detail': 'Venue features do not hold tables.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            count = int(request.data.get('count', 1))
        except (TypeError, ValueError):
            count = 0
        if count < 1 or count > 60:
            return Response(
                {'detail': 'Add between 1 and 60 tables.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            seats = int(request.data.get('seats', 8))
        except (TypeError, ValueError):
            seats = 8
        shape = request.data.get('shape', SeatingTable.Shape.ROUND)
        if shape not in dict(SeatingTable.Shape.choices):
            shape = SeatingTable.Shape.ROUND

        existing = section.tables.count()
        # Continue the numbering past whatever labels are already taken.
        taken = set(
            SeatingTable.objects
            .filter(event_id=section.event_id)
            .values_list('label', flat=True)
        )
        columns = section.columns or 3
        new_tables = []
        number = existing + 1
        for offset in range(count):
            while f'{section.prefix}-{number:02d}' in taken:
                number += 1
            label = f'{section.prefix}-{number:02d}'
            taken.add(label)
            index = existing + offset
            new_tables.append(SeatingTable(
                section=section,
                event_id=section.event_id,
                label=label,
                shape=shape,
                seats=max(1, min(60, seats)),
                x=layout_position(index, columns)[0],
                y=layout_position(index, columns)[1],
                position=index,
            ))
            number += 1
        SeatingTable.objects.bulk_create(new_tables)

        section.refresh_from_db()
        self._annotate_assigned([section], section.event_id)
        return Response(
            self.get_serializer(section).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    def relayout(self, request, pk=None):
        """Re-flow a section's tables into a tidy grid."""
        section = self.get_object()
        columns = section.columns or 3
        tables = list(section.tables.order_by('position', 'id'))
        for index, table in enumerate(tables):
            table.x, table.y = layout_position(index, columns)
            table.position = index
        if tables:
            SeatingTable.objects.bulk_update(tables, ['x', 'y', 'position'])
        section.refresh_from_db()
        self._annotate_assigned([section], section.event_id)
        return Response(self.get_serializer(section).data)


class SeatingTableViewSet(viewsets.ModelViewSet):
    """Individual tables. Sections own them, but they can be edited alone."""

    serializer_class = SeatingTableSerializer
    permission_classes = [IsEventManagerOrAbove]
    pagination_class = None

    def get_queryset(self):
        organization = get_request_organization(self.request, required=True)
        qs = (
            SeatingTable.objects
            .filter(event__organization=organization)
            .select_related('event', 'section')
            .order_by('position', 'id')
        )
        event_id = self.request.query_params.get('event')
        if event_id:
            qs = qs.filter(event_id=event_id)
        return qs

    @action(detail=True, methods=['get'])
    def guests(self, request, pk=None):
        """Who is sitting at this table, plus who is still unassigned.

        Both halves come back together because the builder shows them side by
        side, and asking twice would let them disagree.
        """
        table = self.get_object()
        assigned = seating_service.guests_at_table(table.event_id, table.label)
        unassigned = seating_service.unseated_guests(table.event_id)
        return Response({
            'assigned': list(assigned),
            'unassigned': list(unassigned),
            'seats': table.seats,
        })

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        """Seat or unseat guests at this table.

        {"add": [guest ids], "remove": [guest ids]} — writes Guest.table_number,
        which is what the rest of the product already reads. Guests from another
        event are ignored.
        """
        table = self.get_object()
        add = request.data.get('add') or []
        remove = request.data.get('remove') or []
        if not isinstance(add, list) or not isinstance(remove, list):
            return Response(
                {'detail': 'Provide lists of guest ids to add and remove.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        seated = seating_service.assign_guest_to_table(
            table.event_id, add, table.label,
        )
        cleared = seating_service.clear_guests_from_table(
            table.event_id, remove, table.label,
        )

        return Response({'seated': seated, 'cleared': cleared})
