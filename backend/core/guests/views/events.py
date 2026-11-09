from django.db.models import Count, Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from ..models import Event
from ..serializers import EventSerializer, EventRsvpCustomizationSerializer
from accounts.permissions import IsSuperAdmin, ReadOnlyOrEventManager
from accounts.tenancy import get_request_organization


class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.none()  # satisfies DRF router; actual queryset built in get_queryset
    serializer_class = EventSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [ReadOnlyOrEventManager]

    def get_queryset(self):
        organization = get_request_organization(self.request, required=True)
        return (
            Event.objects
            .filter(organization=organization)
            .select_related('name_font', 'whatsapp_template', 'rsvp_workflow')
            .prefetch_related('locations')
            .annotate(
                guest_count_ann=Count('guests', distinct=True),
                checked_in_count_ann=Count(
                    'guests', filter=Q(guests__status='checked_in'), distinct=True
                ),
                plus_one_count_ann=Count(
                    'guests', filter=Q(guests__plus_one_attending=True), distinct=True
                ),
                plus_one_checked_in_count_ann=Count(
                    'guests', filter=Q(guests__plus_one_checked_in=True), distinct=True
                ),
            )
            .order_by('-date')
        )

    def perform_create(self, serializer):
        serializer.save(organization=get_request_organization(self.request, required=True))

    def get_permissions(self):
        # The creative RSVP surface is intentionally reserved for organization
        # owners and admins. Other event-management permissions stay unchanged.
        if self.action == 'rsvp_page':
            return [IsSuperAdmin()]
        return super().get_permissions()

    @action(detail=True, methods=['get', 'patch'], url_path='rsvp-page')
    def rsvp_page(self, request, pk=None):
        """Read or publish the selected event's public RSVP appearance."""
        event = self.get_object()  # get_queryset() already scopes to the active organization.
        if request.method == 'GET':
            return Response(EventRsvpCustomizationSerializer(event).data)

        serializer = EventRsvpCustomizationSerializer(
            event,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
