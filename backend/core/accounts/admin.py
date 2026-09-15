from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import (
    Membership,
    MessagingSettingsAuditLog,
    Organization,
    OrganizationMessagingSettings,
    User,
)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'role', 'is_active', 'date_joined']
    list_filter  = ['role', 'is_active']
    fieldsets    = BaseUserAdmin.fieldsets + (
        ('Role', {'fields': ('role',)}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Role', {'fields': ('role',)}),
    )


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'timezone', 'is_active', 'created_at']
    list_filter = ['is_active', 'timezone']
    search_fields = ['name', 'slug']


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ['user', 'organization', 'role', 'is_active', 'joined_at']
    list_filter = ['role', 'is_active']
    search_fields = ['user__username', 'user__email', 'organization__name']


@admin.register(OrganizationMessagingSettings)
class OrganizationMessagingSettingsAdmin(admin.ModelAdmin):
    list_display = [
        'organization', 'daily_send_limit', 'rsvp_max_reminders',
        'rsvp_reminder_cooldown_minutes', 'updated_at', 'updated_by',
    ]
    search_fields = ['organization__name']
    readonly_fields = ['updated_at']
    autocomplete_fields = ['organization']


@admin.register(MessagingSettingsAuditLog)
class MessagingSettingsAuditLogAdmin(admin.ModelAdmin):
    """Read-only: the trail is evidence, not editable data."""

    list_display = ['changed_at', 'organization', 'field', 'old_value', 'new_value', 'changed_by']
    list_filter = ['field', 'organization']
    search_fields = ['organization__name', 'field', 'changed_by__username']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
