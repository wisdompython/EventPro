from django.contrib.auth import login, logout, update_session_auth_hash
from django.contrib.auth.tokens import default_token_generator
from django.db import transaction
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from rest_framework.decorators import action

from .models import Membership, Organization, User
from .permissions import IsPlatformAdmin, IsSuperAdmin, IsAuthenticatedAnyRole
from .serializers import (
    LoginSerializer, UserSerializer,
    SignupSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileUpdateSerializer,
    CreateUserSerializer, UpdateUserSerializer,
    OrganizationSerializer,
)
from .throttles import LoginRateThrottle, PasswordResetRateThrottle, SignupRateThrottle
from .tasks import send_password_reset_email
from .tenancy import (
    LEGACY_TO_MEMBERSHIP_ROLE,
    activate_organization,
    get_request_membership,
    get_request_organization,
    unique_organization_slug,
)

@ensure_csrf_cookie
@api_view(['GET'])
@permission_classes([AllowAny])
def csrf_view(request):
    return Response({'detail': 'CSRF cookie set.'})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def login_view(request):
    # DRF normally checks CSRF only after session authentication. Login and
    # signup are anonymous by definition, so enforce the token explicitly.
    SessionAuthentication().enforce_csrf(request)
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data['user']
    login(request, user)
    return Response(UserSerializer(user, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([SignupRateThrottle])
def signup_view(request):
    SessionAuthentication().enforce_csrf(request)
    serializer = SignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        user = serializer.save()
        organization = Organization.objects.create(
            name=serializer.validated_data['organization_name'],
            slug=unique_organization_slug(serializer.validated_data['organization_name']),
            timezone=serializer.validated_data.get('timezone', 'Africa/Lagos'),
            created_by=user,
        )
        Membership.objects.create(
            organization=organization,
            user=user,
            role='owner',
        )
        login(request, user)
        activate_organization(request, organization.id)
    return Response(
        UserSerializer(user, context={'request': request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticatedAnyRole])
def logout_view(request):
    logout(request)
    return Response({'detail': 'Logged out.'})


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticatedAnyRole])
def me_view(request):
    if request.method == 'PATCH':
        serializer = ProfileUpdateSerializer(
            request.user, data=request.data, partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return Response(UserSerializer(request.user, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetRateThrottle])
def password_reset_request_view(request):
    """Send a one-time reset link without revealing whether an email exists."""
    SessionAuthentication().enforce_csrf(request)
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    send_password_reset_email.delay(serializer.validated_data['email'])

    return Response({
        'detail': 'If an active account uses that email, a password reset link has been sent.',
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetRateThrottle])
def password_reset_confirm_view(request):
    SessionAuthentication().enforce_csrf(request)
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        user_id = force_str(urlsafe_base64_decode(serializer.validated_data['uid']))
        user = User.objects.get(pk=user_id, is_active=True)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        user = None

    if user is None or not default_token_generator.check_token(
        user, serializer.validated_data['token'],
    ):
        return Response(
            {'detail': 'This password reset link is invalid or has expired.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer.validate_for_user(user)
    user.set_password(serializer.validated_data['new_password'])
    user.save(update_fields=['password'])
    return Response({'detail': 'Your password has been reset. You can now sign in.'})


@api_view(['POST'])
@permission_classes([IsAuthenticatedAnyRole])
def password_change_view(request):
    serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    request.user.set_password(serializer.validated_data['new_password'])
    request.user.save(update_fields=['password'])
    update_session_auth_hash(request, request.user)
    return Response({'detail': 'Your password has been changed.'})


class OrganizationViewSet(ModelViewSet):
    """Organizations available to the signed-in user."""

    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        return Organization.objects.filter(
            memberships__user=self.request.user,
            memberships__is_active=True,
            is_active=True,
        ).distinct().order_by('name', 'id')

    @transaction.atomic
    def perform_create(self, serializer):
        organization = serializer.save(
            slug=unique_organization_slug(serializer.validated_data['name']),
            created_by=self.request.user,
        )
        Membership.objects.create(
            organization=organization,
            user=self.request.user,
            role='owner',
        )
        activate_organization(self.request, organization.id)

    def partial_update(self, request, *args, **kwargs):
        organization = self.get_object()
        membership = Membership.objects.filter(
            organization=organization,
            user=request.user,
            is_active=True,
            role__in=['owner', 'admin'],
        ).first()
        if membership is None and not request.user.is_superuser:
            return Response(
                {'detail': 'Only organization owners and administrators can update workspace settings.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        membership = activate_organization(request, pk)
        return Response({
            'active_organization': OrganizationSerializer(
                membership.organization,
                context={'request': request},
            ).data,
        })


class UserViewSet(ModelViewSet):
    """CRUD for members of the active organization."""
    permission_classes = [IsSuperAdmin]

    def get_queryset(self):
        organization = get_request_organization(self.request, required=True)
        return User.objects.filter(
            memberships__organization=organization,
            memberships__is_active=True,
        ).distinct().order_by('username')

    def get_serializer_class(self):
        return UserSerializer

    def create(self, request, *args, **kwargs):
        create_ser = CreateUserSerializer(data=request.data)
        create_ser.is_valid(raise_exception=True)
        organization = get_request_organization(request, required=True)
        with transaction.atomic():
            user = create_ser.save()
            Membership.objects.create(
                organization=organization,
                user=user,
                role=LEGACY_TO_MEMBERSHIP_ROLE.get(user.role, 'viewer'),
            )
        return Response(
            UserSerializer(user, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        if instance == request.user and request.data.get('password'):
            return Response(
                {'password': ['Use the change-password form and confirm your current password.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        update_ser = UpdateUserSerializer(instance, data=request.data, partial=partial)
        update_ser.is_valid(raise_exception=True)
        user = update_ser.save()
        organization = get_request_organization(request, required=True)
        Membership.objects.filter(
            organization=organization,
            user=user,
        ).update(role=LEGACY_TO_MEMBERSHIP_ROLE.get(user.role, 'viewer'))
        return Response(UserSerializer(user, context={'request': request}).data)

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        if user == request.user:
            return Response(
                {'detail': 'You cannot delete your own account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        organization = get_request_organization(request, required=True)
        Membership.objects.filter(organization=organization, user=user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
