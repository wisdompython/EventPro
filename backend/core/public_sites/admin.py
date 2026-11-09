from django.contrib import admin

from .models import OrganizationDomain


@admin.register(OrganizationDomain)
class OrganizationDomainAdmin(admin.ModelAdmin):
    list_display = ('hostname', 'organization', 'type', 'status', 'is_primary', 'last_checked_at')
    list_filter = ('type', 'status', 'is_primary')
    search_fields = ('hostname', 'organization__name', 'organization__slug')
    readonly_fields = ('verification_token', 'verified_at', 'activated_at', 'last_checked_at', 'created_at', 'updated_at')
