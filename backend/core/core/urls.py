from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    # Operational diagnostics keep their original /api/auth/operations/ path.
    path('api/auth/', include('platform_ops.urls')),
    path('api/', include('guests.urls')),
    path('api/rsvp/', include('rsvp.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
