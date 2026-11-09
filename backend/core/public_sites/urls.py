from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import OrganizationDomainViewSet, SiteContextView, SiteRsvpResponseView, TlsAskView

router = DefaultRouter()
router.register('domains', OrganizationDomainViewSet, basename='organization-domain')

# Mounted at /api/auth/ — signed-in administration on the app domain.
admin_urlpatterns = [
    path('', include(router.urls)),
]

# Mounted at /api/sites/ — anonymous, resolved from the branded host.
public_urlpatterns = [
    path('current/', SiteContextView.as_view(), name='site-context'),
    path('tls-ask/', TlsAskView.as_view(), name='site-tls-ask'),
    path(
        'rsvp/<slug:event_slug>/<str:identifier>/',
        SiteRsvpResponseView.as_view(),
        name='site-rsvp-response',
    ),
]
