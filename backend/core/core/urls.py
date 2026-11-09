from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from public_sites.urls import admin_urlpatterns as site_admin_urls
from public_sites.urls import public_urlpatterns as site_public_urls

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    # Operational diagnostics keep their original /api/auth/operations/ path.
    path('api/auth/', include('platform_ops.urls')),
    # Organization domains: managed here, served by the branded-site routes below.
    path('api/auth/', include(site_admin_urls)),
    path('api/sites/', include(site_public_urls)),
    path('api/', include('guests.urls')),
    path('api/rsvp/', include('rsvp.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
