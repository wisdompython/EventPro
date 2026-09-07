from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EventViewSet, GuestViewSet, FontViewSet, EventReminderViewSet, WhatsAppTemplateViewSet, TemplateCategoryViewSet, AvailableVarsView, GuestRequirementViewSet, PreferenceDashboardView, SeatingSectionViewSet, SeatingTableViewSet
from .webhook import whatsapp_webhook
from .views.test_views import whatsapp_test_send
from .views.preferences import GuestPreferencesView

router = DefaultRouter()
router.register('events', EventViewSet)
router.register('guests', GuestViewSet)
router.register('fonts', FontViewSet)
router.register('reminders', EventReminderViewSet, basename='reminder')
router.register('whatsapp-templates', WhatsAppTemplateViewSet, basename='whatsapp-template')
router.register('template-categories', TemplateCategoryViewSet, basename='template-category')
router.register('requirements', GuestRequirementViewSet, basename='requirement')
router.register('seating-sections', SeatingSectionViewSet, basename='seating-section')
router.register('seating-tables', SeatingTableViewSet, basename='seating-table')

urlpatterns = [
    # Custom paths BEFORE router so they aren't swallowed by the router's prefix match
    path('whatsapp-templates/available-vars/', AvailableVarsView.as_view(), name='available-vars'),
    path('preferences/dashboard/', PreferenceDashboardView.as_view(), name='preference-dashboard'),
    path('webhooks/whatsapp/', whatsapp_webhook, name='whatsapp_webhook'),
    path('whatsapp/test-send/', whatsapp_test_send, name='whatsapp_test_send'),
    path('guest-preferences/<str:token>/', GuestPreferencesView.as_view(), name='guest-preferences'),
    path('', include(router.urls)),
]
