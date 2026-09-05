from rest_framework import viewsets
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from ..models import Font
from ..serializers import FontSerializer
from accounts.permissions import IsEventManagerOrAbove
from accounts.tenancy import get_request_organization


class FontViewSet(viewsets.ModelViewSet):
    queryset = Font.objects.none()
    serializer_class = FontSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [IsEventManagerOrAbove]

    def get_queryset(self):
        organization = get_request_organization(self.request, required=True)
        return Font.objects.filter(organization=organization).order_by('name')

    def perform_create(self, serializer):
        serializer.save(organization=get_request_organization(self.request, required=True))
