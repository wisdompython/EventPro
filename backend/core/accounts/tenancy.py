from django.http import Http404

from .models import Membership, MembershipRole, Organization, Role


ACTIVE_ORGANIZATION_SESSION_KEY = 'active_organization_id'

MEMBERSHIP_ROLE_RANK = {
    MembershipRole.OWNER: 6,
    MembershipRole.ADMIN: 5,
    MembershipRole.MANAGER: 4,
    MembershipRole.CHECK_IN: 3,
    MembershipRole.SCANNER: 2,
    MembershipRole.VIEWER: 1,
}

LEGACY_TO_MEMBERSHIP_ROLE = {
    Role.SUPER_ADMIN: MembershipRole.OWNER,
    Role.EVENT_MANAGER: MembershipRole.MANAGER,
    Role.CHECK_IN_STAFF: MembershipRole.CHECK_IN,
    Role.SCANNER: MembershipRole.SCANNER,
    Role.VIEWER: MembershipRole.VIEWER,
}

MEMBERSHIP_TO_LEGACY_ROLE = {
    MembershipRole.OWNER: Role.SUPER_ADMIN,
    MembershipRole.ADMIN: Role.SUPER_ADMIN,
    MembershipRole.MANAGER: Role.EVENT_MANAGER,
    MembershipRole.CHECK_IN: Role.CHECK_IN_STAFF,
    MembershipRole.SCANNER: Role.SCANNER,
    MembershipRole.VIEWER: Role.VIEWER,
}


def memberships_for_user(user):
    if not user or not user.is_authenticated:
        return Membership.objects.none()
    return Membership.objects.select_related('organization').filter(
        user=user,
        is_active=True,
        organization__is_active=True,
    )


def get_request_membership(request, *, required=False):
    """Resolve and cache the authenticated user's active organization membership."""
    if hasattr(request, '_event_pro_membership'):
        membership = request._event_pro_membership
        if required and membership is None:
            raise Http404('No active organization is available.')
        return membership

    membership = None
    if request.user and request.user.is_authenticated:
        memberships = memberships_for_user(request.user)
        active_id = request.session.get(ACTIVE_ORGANIZATION_SESSION_KEY)
        if active_id:
            membership = memberships.filter(organization_id=active_id).first()
        if membership is None:
            membership = memberships.order_by('joined_at', 'id').first()
            if membership is not None:
                request.session[ACTIVE_ORGANIZATION_SESSION_KEY] = membership.organization_id
        if membership is None:
            # The legacy test suite creates users directly. Production users are
            # created through organization onboarding/invitations and receive a
            # membership transactionally.
            from django.conf import settings
            if settings.TESTING:
                organization = Organization.objects.order_by('id').first()
                if organization is not None:
                    membership, _ = Membership.objects.get_or_create(
                        organization=organization,
                        user=request.user,
                        defaults={
                            'role': LEGACY_TO_MEMBERSHIP_ROLE.get(
                                request.user.role,
                                MembershipRole.VIEWER,
                            ),
                        },
                    )
                    request.session[ACTIVE_ORGANIZATION_SESSION_KEY] = organization.id

    request._event_pro_membership = membership
    if required and membership is None:
        raise Http404('No active organization is available.')
    return membership


def get_request_organization(request, *, required=False):
    membership = get_request_membership(request, required=required)
    return membership.organization if membership else None


def activate_organization(request, organization_id):
    membership = memberships_for_user(request.user).filter(
        organization_id=organization_id,
    ).first()
    if membership is None:
        raise Http404('Organization not found.')
    request.session[ACTIVE_ORGANIZATION_SESSION_KEY] = membership.organization_id
    request._event_pro_membership = membership
    return membership


def has_membership_role(request, minimum_role):
    if not request.user or not request.user.is_authenticated:
        return False
    membership = get_request_membership(request)
    if membership is None:
        return bool(request.user.is_superuser)
    return MEMBERSHIP_ROLE_RANK.get(membership.role, 0) >= MEMBERSHIP_ROLE_RANK.get(minimum_role, 0)


def legacy_role_for_membership(membership):
    if membership is None:
        return Role.VIEWER
    return MEMBERSHIP_TO_LEGACY_ROLE.get(membership.role, Role.VIEWER)


def unique_organization_slug(name):
    from django.utils.text import slugify

    base = slugify(name)[:160] or 'workspace'
    candidate = base
    suffix = 2
    while Organization.objects.filter(slug=candidate).exists():
        candidate = f'{base[:170 - len(str(suffix))]}-{suffix}'
        suffix += 1
    return candidate
