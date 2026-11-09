"""Domain management (admin app) and the public site API (branded domains).

Admin endpoints resolve the organization from the signed-in membership.
Public endpoints resolve it from the request's host via an active
OrganizationDomain, and scope every query to it.
"""
from django.db import IntegrityError, transaction
from django.http import Http404, HttpResponse
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsSuperAdmin
from accounts.tenancy import get_request_organization
from rsvp.views import PublicRsvpResponseView

from .models import OrganizationDomain
from .serializers import OrganizationDomainSerializer
from .services import (
    check_domain,
    ensure_platform_domain,
    is_tls_allowed,
    make_primary,
    remove_domain,
    resolve_request_domain,
)

# Public routes an organization domain serves today. Later phases (home page,
# event catalogue, check-in) are added here and in the frontend proxy.
PUBLIC_ROUTES = ['rsvp']


class OrganizationDomainViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """The active organization's domains. Owners and admins only."""

    serializer_class = OrganizationDomainSerializer
    permission_classes = [IsSuperAdmin]
    # A handful of rows at most; the settings screen wants them all at once.
    pagination_class = None

    def get_queryset(self):
        organization = get_request_organization(self.request, required=True)
        return OrganizationDomain.objects.filter(organization=organization)

    def list(self, request, *args, **kwargs):
        # Organizations created before platform subdomains were configured
        # receive theirs the first time an admin opens this screen.
        ensure_platform_domain(get_request_organization(request, required=True))
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                serializer.save(
                    organization=get_request_organization(self.request, required=True),
                    created_by=self.request.user,
                )
        except IntegrityError:
            raise ValidationError({'hostname': ['That domain has already been added to an Event Pro workspace.']})

    def perform_destroy(self, instance):
        try:
            remove_domain(instance)
        except ValueError as exc:
            raise ValidationError({'detail': str(exc)})

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        domain = check_domain(self.get_object())
        return Response(self.get_serializer(domain).data)

    @action(detail=True, methods=['post'], url_path='make-primary')
    def make_primary(self, request, pk=None):
        try:
            domain = make_primary(self.get_object())
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(domain).data)


def _require_site(request):
    domain = resolve_request_domain(request)
    if domain is None:
        raise Http404('No Event Pro site is served at this address.')
    return domain


class SiteContextView(APIView):
    """What the current branded domain is and which public routes it serves."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        domain = _require_site(request)
        return Response({
            'hostname': domain.hostname,
            'organization': {
                'name': domain.organization.name,
                'slug': domain.organization.slug,
            },
            'routes': PUBLIC_ROUTES,
        })


class SiteRsvpResponseView(PublicRsvpResponseView):
    """The guest RSVP page, served beneath an organization's own domain.

    A recipient is found only inside the organization the host resolved to,
    and only for the event named in the URL, so a code from one tenant can
    never be redeemed on another tenant's domain.
    """

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.site_domain = _require_site(request)

    def scope_recipients(self, recipients):
        return recipients.filter(
            workflow__event__organization=self.site_domain.organization,
            workflow__event__slug=self.kwargs['event_slug'],
        )

    def media_url(self, request, field):
        # Relative, so images load from the branded domain itself.
        return field.url

    def get(self, request, event_slug, identifier):
        response = super().get(request, identifier)
        response.data['organization_name'] = self.site_domain.organization.name
        return response

    def post(self, request, event_slug, identifier):
        return super().post(request, identifier)


class TlsAskView(APIView):
    """On-demand TLS gate: may the edge proxy issue a certificate for ``domain``?

    Caddy's ``on_demand_tls { ask ... }`` calls this before contacting the CA,
    so certificates are only requested for verified organization domains.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        if is_tls_allowed(request.query_params.get('domain', '')):
            return HttpResponse('ok')
        return HttpResponse('unknown domain', status=404)
