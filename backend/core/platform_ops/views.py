"""Operational diagnostics endpoint.

Lives here rather than in accounts because the snapshot reads across guests,
rsvp and Celery. Keeping the view beside the code it calls means identity has
no dependency on the domain apps at all.
"""

from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsPlatformAdmin

from .monitor import build_queue_monitor_snapshot


class QueueMonitorView(APIView):
    """Super-admin-only, read-only Celery and delivery diagnostics."""

    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        return Response(build_queue_monitor_snapshot())
