from django.db.models.deletion import ProtectedError
from rest_framework import status, viewsets, serializers
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from ..models import EventReminder, ReminderLog, WhatsAppTemplate, TemplateCategory
from accounts.permissions import IsEventManagerOrAbove
from accounts.tenancy import get_request_organization


class EventReminderSerializer(serializers.ModelSerializer):
    logs_sent = serializers.SerializerMethodField()
    includes_event_pass = serializers.SerializerMethodField()

    class Meta:
        model = EventReminder
        fields = [
            'id', 'event', 'hours_before', 'template_name', 'is_active',
            'created_at', 'logs_sent', 'includes_event_pass',
        ]
        read_only_fields = ['id', 'created_at', 'logs_sent', 'includes_event_pass']

    def get_logs_sent(self, obj):
        return sum(1 for log in obj.logs.all() if log.success)

    def get_includes_event_pass(self, obj):
        return WhatsAppTemplate.objects.filter(
            organization=obj.event.organization,
            name=obj.template_name,
            is_active=True,
            has_header_image=True,
        ).exists()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')
        event = attrs.get('event') or (self.instance.event if self.instance else None)
        if request and event:
            organization = get_request_organization(request, required=True)
            if event.organization_id != organization.id:
                raise serializers.ValidationError({'event': 'Event not found.'})
        return attrs


class EventReminderViewSet(viewsets.ModelViewSet):
    serializer_class = EventReminderSerializer
    permission_classes = [IsEventManagerOrAbove]

    def get_queryset(self):
        organization = get_request_organization(self.request, required=True)
        qs = EventReminder.objects.filter(
            event__organization=organization,
        ).select_related('event').prefetch_related('logs')
        event_id = self.request.query_params.get('event')
        if event_id:
            qs = qs.filter(event_id=event_id)
        return qs

    @action(detail=True, methods=['post'], url_path='send_now')
    def send_now(self, request, pk=None):
        """Manually trigger a reminder for all eligible guests immediately."""
        from ..tasks import send_reminder
        from rsvp.services import confirmed_reminder_guest_ids
        reminder = self.get_object()

        already_sent = ReminderLog.objects.filter(
            reminder=reminder,
            success=True,
        ).values_list('guest_id', flat=True)

        guests = (
            reminder.event.guests
            .exclude(pk__in=already_sent)
            .exclude(phone_number='')
        )
        confirmed_guest_ids = confirmed_reminder_guest_ids(reminder.event_id)
        if confirmed_guest_ids is not None:
            guests = guests.filter(pk__in=confirmed_guest_ids)

        queued = 0
        for guest_id in guests.values_list('id', flat=True):
            send_reminder.delay(reminder.id, str(guest_id))
            queued += 1

        return Response({'queued': queued})


AVAILABLE_VARS = [
    {'key': key, 'label': label}
    for key, label in WhatsAppTemplate.AVAILABLE_VARS
]


class TemplateCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TemplateCategory
        fields = ['id', 'name', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_name(self, value):
        request = self.context.get('request')
        if request is None:
            return value.strip()
        organization = get_request_organization(request, required=True)
        matches = TemplateCategory.objects.filter(
            organization=organization,
            name__iexact=value.strip(),
        )
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError('A category with this name already exists.')
        return value.strip()


class WhatsAppTemplateSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = WhatsAppTemplate
        fields = ['id', 'name', 'display_name', 'description', 'category', 'category_name',
                  'body_text', 'body_params', 'has_header_image', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at', 'category_name']

    def validate_category(self, value):
        if value is None:
            return value
        request = self.context.get('request')
        if request is None:
            return value
        organization = get_request_organization(request, required=True)
        if value.organization_id != organization.id:
            raise serializers.ValidationError('Category not found.')
        return value

    def validate_name(self, value):
        request = self.context.get('request')
        if request is None:
            return value.strip()
        organization = get_request_organization(request, required=True)
        matches = WhatsAppTemplate.objects.filter(
            organization=organization,
            name=value.strip(),
        )
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError('This Meta template is already registered in the workspace.')
        return value.strip()


class AvailableVarsView(APIView):
    permission_classes = [IsEventManagerOrAbove]

    def get(self, request):
        return Response(AVAILABLE_VARS)


class TemplateCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = TemplateCategorySerializer
    permission_classes = [IsEventManagerOrAbove]
    pagination_class = None  # small list, no pagination needed

    def get_queryset(self):
        organization = get_request_organization(self.request, required=True)
        return TemplateCategory.objects.filter(organization=organization)

    def perform_create(self, serializer):
        serializer.save(organization=get_request_organization(self.request, required=True))


class WhatsAppTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = WhatsAppTemplateSerializer
    permission_classes = [IsEventManagerOrAbove]

    def get_queryset(self):
        organization = get_request_organization(self.request, required=True)
        qs = WhatsAppTemplate.objects.filter(
            organization=organization,
        ).select_related('category')
        if self.request.query_params.get('active_only') == '1':
            qs = qs.filter(is_active=True)
        if cat := self.request.query_params.get('category'):
            qs = qs.filter(category_id=cat)
        return qs

    def perform_create(self, serializer):
        serializer.save(organization=get_request_organization(self.request, required=True))

    def destroy(self, request, *args, **kwargs):
        template = self.get_object()
        if (
            template.events.exists()
            or template.rsvp_invitation_workflows.exists()
            or template.rsvp_pass_workflows.exists()
        ):
            return Response(
                {
                    'detail': (
                        'This template is currently used by an event or RSVP workflow. '
                        'Choose another template there before deleting it.'
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )
        try:
            template.delete()
        except ProtectedError:
            return Response(
                {
                    'detail': (
                        'This template is currently used by an event or RSVP workflow. '
                        'Choose another template there before deleting it.'
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
