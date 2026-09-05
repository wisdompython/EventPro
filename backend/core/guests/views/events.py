from django.db.models import Count, Q
from rest_framework import viewsets
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from ..models import Event
from ..serializers import EventSerializer
from accounts.permissions import ReadOnlyOrEventManager
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
