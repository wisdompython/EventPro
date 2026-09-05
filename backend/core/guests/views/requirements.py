"""Requirement builder API.

Phase 2 of docs/guest-requirements-plan.md: planners define the questions an
event asks its guests. Nothing here reads or writes guest answers - that is
Phase 3.
"""

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsEventManagerOrAbove
from accounts.tenancy import get_request_organization

from ..domains import preferences
from ..models import Event, GuestRequirement


# Starting points so a planner never faces a blank page. These are copied into
# the event when chosen - they are not shared records (decision 3), so editing
# one afterwards affects only that event.
REQUIREMENT_PRESETS = [
    {
        'key': 'aso_ebi',
        'label': 'Aso Ebi',
        'help_text': 'Guests who want the event fabric, and how much they need.',
        'kind': GuestRequirement.Kind.QUANTITY,
        'unit': 'yards',
        'options': [],
        # Fabric is ordered once per invitation, not per attendee.
        'applies_to': GuestRequirement.AppliesTo.PRIMARY,
    },
    {
        'key': 'meal_choice',
        'label': 'Meal choice',
        'help_text': 'What each guest would like to eat.',
        'kind': GuestRequirement.Kind.CHOICE,
        'unit': '',
        'options': ['Chicken', 'Fish', 'Beef', 'Vegetarian'],
        # Everyone eats, so a companion answers for themselves.
        'applies_to': GuestRequirement.AppliesTo.EVERYONE,
    },
    {
        'key': 'dietary',
        'label': 'Dietary requirements',
        'help_text': 'Allergies and restrictions the caterer must know about.',
        'kind': GuestRequirement.Kind.MULTI_CHOICE,
        'unit': '',
        'options': ['Nuts', 'Dairy', 'Gluten', 'Shellfish', 'Halal', 'Kosher'],
        'applies_to': GuestRequirement.AppliesTo.EVERYONE,
    },
    {
        'key': 'transport',
        'label': 'Shuttle seat',
        'help_text': 'Guests who need transport laid on.',
        'kind': GuestRequirement.Kind.BOOLEAN,
        'unit': '',
        'options': [],
        'applies_to': GuestRequirement.AppliesTo.EVERYONE,
    },
    {
        'key': 'accommodation',
        'label': 'Accommodation nights',
        'help_text': 'Guests who need a room, and for how many nights.',
        'kind': GuestRequirement.Kind.QUANTITY,
        'unit': 'nights',
        'options': [],
        'applies_to': GuestRequirement.AppliesTo.PRIMARY,
    },
]

_KINDS_WITH_OPTIONS = {
    GuestRequirement.Kind.CHOICE,
    GuestRequirement.Kind.MULTI_CHOICE,
}


class GuestRequirementSerializer(serializers.ModelSerializer):
    response_count = serializers.SerializerMethodField()

    class Meta:
        model = GuestRequirement
        fields = [
            'id', 'event', 'key', 'label', 'help_text',
            'kind', 'options', 'unit',
            'required', 'applies_to', 'collect_on',
            'position', 'is_active', 'created_at', 'response_count',
        ]
        read_only_fields = ['id', 'created_at', 'response_count']

    def get_response_count(self, obj):
        # Annotated in get_queryset; fall back for single-object writes.
        count = getattr(obj, 'answer_count', None)
        return count if count is not None else obj.responses.count()

    def validate_options(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Options must be a list.')
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        if len(set(cleaned)) != len(cleaned):
            raise serializers.ValidationError('Each option must be different.')
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

        kind = attrs.get('kind') or (self.instance.kind if self.instance else None)
        options = attrs.get('options')
        if options is None and self.instance:
            options = self.instance.options

        if kind in _KINDS_WITH_OPTIONS:
            if not options:
                raise serializers.ValidationError(
                    {'options': 'Add at least one option for guests to choose from.'},
                )
        elif options:
            raise serializers.ValidationError(
                {'options': 'Only choice questions use options.'},
            )

        unit = attrs.get('unit')
        if unit is None and self.instance:
            unit = self.instance.unit
        if unit and kind != GuestRequirement.Kind.QUANTITY:
            raise serializers.ValidationError(
                {'unit': 'Only quantity questions use a unit.'},
            )

        return attrs


class GuestRequirementViewSet(viewsets.ModelViewSet):
    """Questions an event asks its guests.

    Scoped to the active organisation through the event, so an id from another
    organisation is simply not found.
    """

    serializer_class = GuestRequirementSerializer
    permission_classes = [IsEventManagerOrAbove]

    def get_queryset(self):
        from django.db.models import Count

        organization = get_request_organization(self.request, required=True)
        qs = (
            GuestRequirement.objects
            .filter(event__organization=organization)
            .select_related('event')
            .annotate(answer_count=Count('responses'))
            # Annotate() drops Meta.ordering, and paginating an unordered
            # queryset can repeat or skip rows between pages.
            .order_by('position', 'id')
        )
        event_id = self.request.query_params.get('event')
        if event_id:
            qs = qs.filter(event_id=event_id)
        return qs

    @action(detail=False, methods=['get'])
    def presets(self, request):
        """Starting points for the builder."""
        return Response(REQUIREMENT_PRESETS)

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """Persist a drag-and-drop reorder.

        Takes {"event": <id>, "order": [<requirement id>, ...]} and writes the
        position of each. Ids outside the event are ignored rather than erroring,
        so a stale tab cannot reorder another event's questions.
        """
        event_id = request.data.get('event')
        order = request.data.get('order')
        if not event_id or not isinstance(order, list):
            return Response(
                {'detail': 'Provide an event and an ordered list of requirement ids.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organization = get_request_organization(request, required=True)
        if not Event.objects.filter(pk=event_id, organization=organization).exists():
            return Response({'detail': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)

        requirements = {
            requirement.id: requirement
            for requirement in GuestRequirement.objects.filter(event_id=event_id)
        }
        to_update = []
        for position, requirement_id in enumerate(order):
            requirement = requirements.get(requirement_id)
            if requirement is not None and requirement.position != position:
                requirement.position = position
                to_update.append(requirement)
        if to_update:
            GuestRequirement.objects.bulk_update(to_update, ['position'])

        return Response({'updated': len(to_update)})


class PreferenceDashboardView(APIView):
    """Everything a planner needs to read one event's collected preferences.

    Returned as a single payload rather than several endpoints because the page
    shows totals and the guest roster side by side — fetching them separately
    would let the two disagree while a guest answers mid-load.
    """

    permission_classes = [IsEventManagerOrAbove]

    def get(self, request):
        event_id = request.query_params.get('event')
        if not event_id:
            return Response(
                {'detail': 'Provide an event.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organization = get_request_organization(request, required=True)
        if not Event.objects.filter(pk=event_id, organization=organization).exists():
            return Response({'detail': 'Event not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'summary': preferences.response_summary(event_id),
            'legacy': preferences.legacy_totals(event_id),
            'questions': preferences.question_totals(event_id),
            'seating': preferences.seating_service_plan(event_id),
            'columns': preferences.requirement_columns(event_id),
            'guests': preferences.guest_roster(
                event_id,
                search=request.query_params.get('search', '').strip(),
                answered=request.query_params.get('answered', ''),
            ),
        })
