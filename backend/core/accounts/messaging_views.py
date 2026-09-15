"""Messaging settings API for the active organization.

Tenancy: the organization is always resolved from the request's active
membership, never from a client-supplied id, so there is no path by which one
workspace can read or write another's settings.

Permissions: owner and admin memberships (and platform superusers) may write;
every other role gets read-only, matching how the existing viewsets grade
access.
"""
from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .messaging_serializers import (
    MessagingSettingsAuditLogSerializer,
    OrganizationMessagingSettingsSerializer,
    render_setting_value,
    build_settings_payload,
)
from .messaging_settings import OVERRIDABLE_FIELDS, clear_cache
from .models import MembershipRole, MessagingSettingsAuditLog, OrganizationMessagingSettings
from .permissions import IsAuthenticatedAnyRole
from .tenancy import get_request_membership, get_request_organization

WRITE_ROLES = {MembershipRole.OWNER, MembershipRole.ADMIN}


class CanReadMessagingSettings(IsAuthenticatedAnyRole):
    """Any member may look; only owners and admins may change."""

    SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.method in self.SAFE_METHODS:
            return True
        if request.user.is_superuser:
            return True
        membership = get_request_membership(request)
        return bool(membership and membership.role in WRITE_ROLES)


class MessagingSettingsView(APIView):
    """Read and update the active organization's messaging settings."""

    permission_classes = [CanReadMessagingSettings]

    def get(self, request):
        organization = get_request_organization(request, required=True)
        return Response(build_settings_payload(organization))

    def patch(self, request):
        organization = get_request_organization(request, required=True)

        # Only fields actually present in the body are touched, so a partial
        # save from one section cannot reset another section's overrides.
        submitted = {
            name: value for name, value in request.data.items()
            if name in OVERRIDABLE_FIELDS
        }
        if not submitted:
            return Response(
                {'detail': 'No messaging settings were supplied.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            row, _ = OrganizationMessagingSettings.objects.select_for_update().get_or_create(
                organization=organization,
            )
            serializer = OrganizationMessagingSettingsSerializer(
                row, data=submitted, partial=True,
            )
            serializer.is_valid(raise_exception=True)

            # Capture the before-values for the audit trail while the row is
            # still unchanged and the transaction holds the lock.
            changes = []
            for name, new_value in serializer.validated_data.items():
                old_value = getattr(row, name)
                if render_setting_value(old_value) == render_setting_value(new_value):
                    continue
                changes.append((name, old_value, new_value))

            serializer.save(updated_by=request.user)

            MessagingSettingsAuditLog.objects.bulk_create([
                MessagingSettingsAuditLog(
                    organization=organization,
                    field=name,
                    old_value=render_setting_value(old_value)[:200],
                    new_value=render_setting_value(new_value)[:200],
                    changed_by=request.user,
                )
                for name, old_value, new_value in changes
            ])

        # Anything this process resolved before the write is now stale.
        clear_cache(organization.id)
        return Response(build_settings_payload(organization))


class MessagingSettingsAuditView(APIView):
    """Who changed which messaging value, and when.

    Read access matches the settings page itself: these values control spend
    and deliverability, so every member who can see a number can see how it
    got there.
    """

    permission_classes = [IsAuthenticatedAnyRole]

    def get(self, request):
        organization = get_request_organization(request, required=True)
        entries = MessagingSettingsAuditLog.objects.filter(
            organization=organization,
        ).select_related('changed_by')[:100]
        return Response(MessagingSettingsAuditLogSerializer(entries, many=True).data)
