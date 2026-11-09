from rest_framework import serializers

from .hostnames import InvalidHostname, classify_custom_hostname, is_reserved, normalize_hostname
from .models import OrganizationDomain
from .services import dns_records_for, site_url_for


class OrganizationDomainSerializer(serializers.ModelSerializer):
    type_display = serializers.CharField(source='get_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    url = serializers.SerializerMethodField()
    dns_records = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationDomain
        fields = (
            'id', 'hostname', 'type', 'type_display', 'status', 'status_display',
            'is_primary', 'url', 'dns_records',
            'verified_at', 'activated_at', 'last_checked_at', 'last_check_message',
            'created_at',
        )
        read_only_fields = tuple(f for f in fields if f != 'hostname')

    def get_url(self, obj):
        return site_url_for(obj.hostname)

    def get_dns_records(self, obj):
        return dns_records_for(obj)

    def validate_hostname(self, value):
        try:
            hostname = normalize_hostname(value)
        except InvalidHostname as exc:
            raise serializers.ValidationError(str(exc)) from exc
        if is_reserved(hostname):
            raise serializers.ValidationError('That domain belongs to Event Pro and cannot be added.')
        if OrganizationDomain.objects.filter(hostname=hostname).exists():
            # Deliberately the same message whichever organization holds it, so
            # this endpoint cannot be used to discover other customers' domains.
            raise serializers.ValidationError('That domain has already been added to an Event Pro workspace.')
        return hostname

    def create(self, validated_data):
        validated_data['type'] = classify_custom_hostname(validated_data['hostname'])
        return super().create(validated_data)
