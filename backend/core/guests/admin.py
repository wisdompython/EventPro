from django.contrib import admin
from .models import Event, Guest, BulkUpload, GuestRequirement, GuestRequirementResponse, SeatingSection, SeatingTable


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ('name', 'date', 'venue', 'collect_aso_ebi', 'pass_send_at', 'guest_count', 'created_at')
    search_fields = ('name', 'venue')

    def guest_count(self, obj):
        return obj.guests.count()
    guest_count.short_description = 'Guests'


@admin.register(Guest)
class GuestAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'phone_number', 'event', 'ticket_type', 'table_number', 'aso_ebi_quantity', 'status', 'whatsapp_sent', 'scheduled_send_at', 'registered_at')
    list_filter = ('status', 'ticket_type', 'aso_ebi_requested', 'whatsapp_sent', 'event')
    search_fields = ('full_name', 'phone_number', 'email')
    readonly_fields = ('id', 'qr_code', 'pass_image', 'checked_in_at', 'whatsapp_sent_at', 'registered_at')
    autocomplete_fields = ('event',)


@admin.register(BulkUpload)
class BulkUploadAdmin(admin.ModelAdmin):
    list_display = ('event', 'status', 'total_rows', 'successful_rows', 'skipped_rows', 'failed_rows', 'uploaded_at')
    list_filter = ('status', 'event')
    readonly_fields = ('status', 'total_rows', 'successful_rows', 'skipped_rows', 'failed_rows', 'error_report', 'skipped_report', 'uploaded_at')


@admin.register(GuestRequirement)
class GuestRequirementAdmin(admin.ModelAdmin):
    list_display = ('label', 'event', 'kind', 'unit', 'applies_to', 'collect_on', 'required', 'is_active', 'position')
    list_filter = ('kind', 'applies_to', 'collect_on', 'required', 'is_active', 'event')
    search_fields = ('label', 'key')
    autocomplete_fields = ('event',)


@admin.register(GuestRequirementResponse)
class GuestRequirementResponseAdmin(admin.ModelAdmin):
    list_display = ('guest', 'requirement', 'display_value', 'updated_at')
    list_filter = ('requirement__kind', 'requirement__event')
    search_fields = ('guest__full_name', 'guest__phone_number')
    readonly_fields = ('responded_at', 'updated_at')


@admin.register(SeatingSection)
class SeatingSectionAdmin(admin.ModelAdmin):
    list_display = ('name', 'prefix', 'event', 'is_reserved', 'position', 'created_at')
    list_filter = ('is_reserved', 'event')
    search_fields = ('name', 'prefix')
    autocomplete_fields = ('event',)


@admin.register(SeatingTable)
class SeatingTableAdmin(admin.ModelAdmin):
    list_display = ('label', 'section', 'event', 'shape', 'seats', 'created_at')
    list_filter = ('shape', 'event')
    search_fields = ('label',)
    autocomplete_fields = ('event', 'section')
