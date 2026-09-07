import csv
import io
import logging
from rest_framework import serializers

logger = logging.getLogger(__name__)
from ..models import Event, BulkUpload, Guest, SeatingTable
from .event import _event_required_fields, _event_valid_ticket_values
from accounts.tenancy import get_request_organization


TRUE_VALUES = {'1', 'true', 'yes', 'y', 'requested'}
FALSE_VALUES = {'', '0', 'false', 'no', 'n', 'not requested'}


def parse_guest_csv(event, csv_file, *, replace_existing=False):
    """Parse a guest CSV without retaining request/serializer state."""
    required = _event_required_fields(event)
    valid_ticket_values = _event_valid_ticket_values(event)
    default_ticket = valid_ticket_values[0] if valid_ticket_values else 'general'
    configured_tables = list(
        SeatingTable.objects.filter(event=event)
        .select_related('section')
        .order_by('section__position', 'position', 'id')
    )
    tables_by_label = {table.label.casefold(): table for table in configured_tables}
    tables_by_area = {}
    for table in configured_tables:
        tables_by_area.setdefault(table.section.name.casefold(), []).append(table)
    occupied = {table.id: set() for table in configured_tables}
    existing_guests = Guest.objects.none() if replace_existing else Guest.objects.filter(event=event)
    for label, seat in existing_guests.exclude(table_number='').values_list(
        'table_number', 'seat_number',
    ):
        table = tables_by_label.get(label.casefold())
        try:
            number = int(seat)
        except (TypeError, ValueError):
            continue
        if table and 1 <= number <= table.seats:
            occupied[table.id].add(number)

    csv_file.seek(0)
    raw = csv_file.read()
    for enc in ('utf-8-sig', 'utf-8', 'latin-1', 'cp1252'):
        try:
            text = raw.decode(enc)
            break
        except (UnicodeDecodeError, ValueError):
            continue
    else:
        text = raw.decode('latin-1')
    reader = csv.DictReader(io.StringIO(text))

    raw_headers = reader.fieldnames or []
    headers = {h.strip().lower() for h in raw_headers}
    logger.info("CSV headers parsed=%r", headers)

    if 'full_name' not in headers:
        raise serializers.ValidationError({
            'csv_file': (
                "CSV is missing the required 'full_name' column. "
                f'Found columns: {list(headers)}'
            ),
        })

    valid_rows = []
    error_report = []
    for i, raw_row in enumerate(reader, start=2):
        row = {k.strip().lower(): v.strip() for k, v in raw_row.items() if k}
        if not any(row.values()):
            continue
        errors = []

        aso_ebi_requested = False
        aso_ebi_quantity = 0
        raw_aso_ebi = row.get('aso_ebi_requested', '').lower()
        if raw_aso_ebi in TRUE_VALUES:
            aso_ebi_requested = True
        elif raw_aso_ebi not in FALSE_VALUES:
            errors.append("'aso_ebi_requested' must be yes or no.")

        if aso_ebi_requested:
            if not event.collect_aso_ebi:
                errors.append('Aso Ebi requests are not enabled for this event.')
            try:
                aso_ebi_quantity = int(
                    row.get('aso_ebi_yards') or row.get('aso_ebi_quantity', '')
                )
                if aso_ebi_quantity < 1:
                    raise ValueError
            except (TypeError, ValueError):
                errors.append(
                    "'aso_ebi_yards' must be a whole number of at least 1 "
                    'when Aso Ebi is requested.'
                )

        plus_one_attending = False
        raw_plus_one = row.get('plus_one_attending', '').lower()
        if raw_plus_one in TRUE_VALUES:
            plus_one_attending = True
            if not event.allow_plus_one:
                errors.append('Plus one is not enabled for this event.')
        elif raw_plus_one not in FALSE_VALUES:
            errors.append("'plus_one_attending' must be yes or no.")
        plus_one_full_name = row.get('plus_one_full_name', '').strip()
        plus_one_phone_number = row.get('plus_one_phone_number', '').strip()
        if plus_one_attending:
            if not plus_one_full_name:
                errors.append("'plus_one_full_name' is required when a plus one is attending.")
            if not plus_one_phone_number:
                errors.append("'plus_one_phone_number' is required when a plus one is attending.")

        celebrant_name = row.get('celebrant_name', '').strip()
        if celebrant_name and not event.collect_celebrant:
            errors.append('Celebrant preferences are not enabled for this event.')
        if celebrant_name and event.celebrant_options and celebrant_name not in event.celebrant_options:
            errors.append("'celebrant_name' must match a configured celebrant.")

        seating_area = row.get('seating_area', '').strip()
        table_number = row.get('table_number', '').strip()
        seat_number = row.get('seat_number', '').strip()
        selected_table = None
        selected_seat = None
        if configured_tables and (seating_area or table_number or seat_number):
            area_tables = tables_by_area.get(seating_area.casefold()) if seating_area else None
            if seating_area and not area_tables:
                errors.append(f"Unknown seating area '{seating_area}'.")
            if table_number:
                selected_table = tables_by_label.get(table_number.casefold())
                if not selected_table:
                    errors.append(f"Unknown table '{table_number}'.")
                elif area_tables and selected_table not in area_tables:
                    errors.append(f"Table '{table_number}' is not in seating area '{seating_area}'.")
            elif area_tables:
                selected_table = next(
                    (table for table in area_tables if len(occupied[table.id]) < table.seats),
                    None,
                )
                if not selected_table:
                    errors.append(f"Seating area '{seating_area}' has no available seats.")
            elif seat_number:
                errors.append("'seat_number' needs a table_number or seating_area.")

            if selected_table:
                table_number = selected_table.label
                if seat_number:
                    try:
                        selected_seat = int(seat_number)
                    except ValueError:
                        selected_seat = 0
                    if not 1 <= selected_seat <= selected_table.seats:
                        errors.append(
                            f"'seat_number' must be between 1 and {selected_table.seats} for {selected_table.label}."
                        )
                    elif selected_seat in occupied[selected_table.id]:
                        errors.append(f"Seat {selected_seat} at {selected_table.label} is already assigned.")
                else:
                    selected_seat = next(
                        (number for number in range(1, selected_table.seats + 1)
                         if number not in occupied[selected_table.id]),
                        None,
                    )
                    if selected_seat is None:
                        errors.append(f"Table '{selected_table.label}' has no available seats.")
                seat_number = str(selected_seat) if selected_seat else ''

        row['table_number'] = table_number
        row['seat_number'] = seat_number

        for field in required:
            if not row.get(field, ''):
                errors.append(f"'{field}' is required for this event.")

        ticket_type = row.get('ticket_type', '').lower().strip()
        if not ticket_type:
            ticket_type = default_ticket
        elif valid_ticket_values and ticket_type not in valid_ticket_values:
            label_match = next(
                (
                    ticket['value']
                    for ticket in (event.ticket_types or [])
                    if ticket.get('label', '').lower() == ticket_type
                ),
                None,
            )
            ticket_type = label_match or default_ticket

        if errors:
            error_report.append({'row': i, 'data': row, 'errors': errors})
            continue

        if selected_table and selected_seat:
            occupied[selected_table.id].add(selected_seat)

        valid_rows.append({
            '_csv_row': i,
            'event': event,
            'full_name': row.get('full_name', ''),
            'phone_number': row.get('phone_number', ''),
            'email': row.get('email', ''),
            'ticket_type': ticket_type,
            'table_number': table_number,
            'seat_number': seat_number,
            'aso_ebi_requested': aso_ebi_requested,
            'aso_ebi_quantity': aso_ebi_quantity,
            'plus_one_attending': plus_one_attending,
            '_plus_one_full_name': plus_one_full_name,
            '_plus_one_phone_number': plus_one_phone_number,
            'celebrant_name': celebrant_name,
            'scheduled_send_at': event.pass_send_at,
        })
    return valid_rows, error_report


class BulkGuestUploadSerializer(serializers.Serializer):
    event = serializers.PrimaryKeyRelatedField(queryset=Event.objects.all())
    csv_file = serializers.FileField()
    replace_existing = serializers.BooleanField(required=False, default=False)

    def validate_csv_file(self, value):
        if not value.name.endswith('.csv'):
            raise serializers.ValidationError("Only .csv files are accepted.")
        return value

    def validate_event(self, value):
        request = self.context.get('request')
        if request is None:
            return value
        organization = get_request_organization(request, required=True)
        if value.organization_id != organization.id:
            raise serializers.ValidationError('Event not found.')
        return value

    def parse(self):
        """
        Parse the uploaded CSV using the event's required_fields and ticket_types config.
        Returns (valid_rows, error_report).
        """
        return parse_guest_csv(
            self.validated_data['event'],
            self.validated_data['csv_file'],
            replace_existing=self.validated_data.get('replace_existing', False),
        )


class BulkUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = BulkUpload
        fields = (
            'id', 'event', 'csv_file', 'status',
            'total_rows', 'successful_rows', 'failed_rows',
            'skipped_rows',
            'replace_existing', 'replaced_rows', 'recipients_created',
            'assets_total', 'assets_processed', 'assets_failed',
            'error_report', 'skipped_report', 'error_message', 'task_id',
            'started_at', 'completed_at', 'uploaded_at',
        )
        read_only_fields = (
            'id', 'status', 'total_rows', 'successful_rows',
            'failed_rows', 'replace_existing', 'replaced_rows',
            'skipped_rows',
            'recipients_created', 'assets_total', 'assets_processed',
            'assets_failed', 'error_report', 'skipped_report', 'error_message', 'task_id',
            'started_at', 'completed_at', 'uploaded_at',
        )
