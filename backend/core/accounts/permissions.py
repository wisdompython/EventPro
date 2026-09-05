from rest_framework.permissions import BasePermission
from rest_framework.authentication import SessionAuthentication
from .models import MembershipRole
from .tenancy import get_request_membership, has_membership_role


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """Deprecated: retained only so old imports fail loudly rather than silently.

    This used to disable CSRF enforcement on every endpoint, on the theory that
    CORS protected us. It does not: CORS restricts who may *read* a cross-origin
    response, but a cross-site POST is still delivered and still carries the
    session cookie. Use SessionAuthentication (the default) instead.
    """

    def __init__(self, *args, **kwargs):
        raise RuntimeError(
            'CsrfExemptSessionAuthentication has been removed. Use '
            'rest_framework.authentication.SessionAuthentication, which enforces CSRF.'
        )


class IsSuperAdmin(BasePermission):
    """Organization owners/admins, plus platform superusers."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and
            (request.user.is_superuser or has_membership_role(request, MembershipRole.ADMIN))
        )


class IsPlatformAdmin(BasePermission):
    """Operations that are intentionally global across customer organizations."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class IsEventManagerOrAbove(BasePermission):
    """Super admin or event manager."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and
            (request.user.is_superuser or has_membership_role(request, MembershipRole.MANAGER))
        )


class IsCheckInStaffOrAbove(BasePermission):
    """Any authenticated staff (check-in, manager, super admin)."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and
            (request.user.is_superuser or has_membership_role(request, MembershipRole.CHECK_IN))
        )


class IsScanner(BasePermission):
    """Scanner-only role — QR scan and check-in actions only, no guest list access."""
    def has_permission(self, request, view):
        membership = get_request_membership(request)
        return bool(
            request.user and request.user.is_authenticated and membership and
            membership.role == MembershipRole.SCANNER
        )


class IsCheckInOrScanner(BasePermission):
    """Check-in staff, scanner, or above — for scan and check_in actions."""
    def has_permission(self, request, view):
        membership = get_request_membership(request)
        return bool(
            request.user and request.user.is_authenticated and
            (request.user.is_superuser or (
                membership and membership.role in {
                    MembershipRole.OWNER,
                    MembershipRole.ADMIN,
                    MembershipRole.MANAGER,
                    MembershipRole.CHECK_IN,
                    MembershipRole.SCANNER,
                }
            ))
        )


class IsAuthenticatedAnyRole(BasePermission):
    """Any authenticated user (including viewer)."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and
            (request.user.is_superuser or get_request_membership(request) is not None)
        )


# Convenience: read-only for viewers/check-in staff, write for managers+
class ReadOnlyOrEventManager(BasePermission):
    """
    GET/HEAD/OPTIONS allowed for any authenticated user.
    Mutating methods (POST/PUT/PATCH/DELETE) require event_manager or above.
    """
    SAFE_METHODS = ('GET', 'HEAD', 'OPTIONS')

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in self.SAFE_METHODS:
            return True
        return request.user.is_superuser or has_membership_role(request, MembershipRole.MANAGER)
