from django.urls import path

from .views import QueueMonitorView

urlpatterns = [
    # Kept at the original path so the admin UI is unaffected by the move.
    path('operations/queue/', QueueMonitorView.as_view()),
]
