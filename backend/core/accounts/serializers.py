from django.contrib.auth import authenticate
from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.text import slugify
from rest_framework import serializers
from .models import Membership, Organization, User, Role
from .tenancy import get_request_membership, legacy_role_for_membership


class OrganizationSummarySerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    role_display = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            'id', 'name', 'slug', 'timezone', 'is_active',
            'role', 'role_display', 'member_count',
        ]

    def _membership(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        return Membership.objects.filter(
            organization=obj,
            user=request.user,
            is_active=True,
        ).first()

    def get_role(self, obj):
        membership = self._membership(obj)
        return membership.role if membership else None

    def get_role_display(self, obj):
        membership = self._membership(obj)
        return membership.get_role_display() if membership else None

    def get_member_count(self, obj):
        return obj.memberships.filter(is_active=True).count()


class OrganizationSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    role_display = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            'id', 'name', 'slug', 'timezone', 'is_active',
            'role', 'role_display', 'member_count', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'slug', 'is_active', 'created_at', 'updated_at']

    def _membership(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        return Membership.objects.filter(
            organization=obj,
            user=request.user,
            is_active=True,
        ).first()

    def get_role(self, obj):
        membership = self._membership(obj)
        return membership.role if membership else None

    def get_role_display(self, obj):
        membership = self._membership(obj)
        return membership.get_role_display() if membership else None

    def get_member_count(self, obj):
        return obj.memberships.filter(is_active=True).count()


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        identifier = data['username']
        password = data['password']

        # Allow login with email address as well as username
        user = authenticate(username=identifier, password=password)
        if not user:
            try:
                from .models import User as UserModel
                u = UserModel.objects.get(email__iexact=identifier)
                user = authenticate(username=u.username, password=password)
            except (UserModel.DoesNotExist, UserModel.MultipleObjectsReturned):
                pass

        if not user:
            raise serializers.ValidationError('Invalid credentials.')
        if not user.is_active:
            raise serializers.ValidationError('Account is disabled.')
        data['user'] = user
        return data


class SignupSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    organization_name = serializers.CharField(max_length=160)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)
    timezone = serializers.CharField(max_length=64, required=False, default='Africa/Lagos')
    accept_terms = serializers.BooleanField(write_only=True)

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return email

    def validate_organization_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError('Enter your organization or business name.')
        return value

    def validate_accept_terms(self, value):
        if not value:
            raise serializers.ValidationError('You must accept the terms to create an account.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})

        password_user = User(
            username=self._username_base(attrs['email']),
            email=attrs['email'],
            first_name=attrs['first_name'],
            last_name=attrs['last_name'],
        )
        try:
            password_validation.validate_password(attrs['password'], password_user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)}) from exc
        return attrs

    @staticmethod
    def _username_base(email):
        return slugify(email.split('@', 1)[0]).replace('-', '_')[:120] or 'eventpro_user'

    def _unique_username(self, email):
        base = self._username_base(email)
        candidate = base
        suffix = 2
        while User.objects.filter(username__iexact=candidate).exists():
            candidate = f'{base[:140 - len(str(suffix))]}_{suffix}'
            suffix += 1
        return candidate

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        validated_data.pop('organization_name')
        validated_data.pop('timezone', None)
        validated_data.pop('accept_terms')
        password = validated_data.pop('password')
        user = User(
            username=self._unique_username(validated_data['email']),
            role=Role.SUPER_ADMIN,
            **validated_data,
        )
        user.set_password(password)
        user.save()
        return user


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    role_display = serializers.SerializerMethodField()
    membership_role = serializers.SerializerMethodField()
    membership_role_display = serializers.SerializerMethodField()
    active_organization = serializers.SerializerMethodField()
    organizations = serializers.SerializerMethodField()
    is_platform_admin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'role_display', 'is_active', 'date_joined', 'last_login',
            'membership_role', 'membership_role_display',
            'active_organization', 'organizations',
            'is_platform_admin',
        ]
        read_only_fields = ['id', 'date_joined', 'last_login']

    def _membership(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        active = get_request_membership(request)
        if active is None:
            return None
        if obj.pk == request.user.pk:
            return active
        return Membership.objects.filter(
            organization=active.organization,
            user=obj,
            is_active=True,
        ).first()

    def get_role(self, obj):
        membership = self._membership(obj)
        return legacy_role_for_membership(membership) if membership else obj.role

    def get_role_display(self, obj):
        return dict(Role.choices).get(self.get_role(obj), 'Viewer')

    def get_membership_role(self, obj):
        membership = self._membership(obj)
        return membership.role if membership else None

    def get_membership_role_display(self, obj):
        membership = self._membership(obj)
        return membership.get_role_display() if membership else None

    def get_active_organization(self, obj):
        request = self.context.get('request')
        if not request or obj.pk != request.user.pk:
            return None
        membership = get_request_membership(request)
        if membership is None:
            return None
        return OrganizationSummarySerializer(
            membership.organization,
            context=self.context,
        ).data

    def get_organizations(self, obj):
        request = self.context.get('request')
        if not request or obj.pk != request.user.pk:
            return []
        organizations = Organization.objects.filter(
            memberships__user=obj,
            memberships__is_active=True,
            is_active=True,
        ).distinct().order_by('name', 'id')
        return OrganizationSummarySerializer(
            organizations,
            many=True,
            context=self.context,
        ).data

    def get_is_platform_admin(self, obj):
        return obj.is_superuser


class CreateUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'role', 'password']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UpdateUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'role', 'is_active', 'password']

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
