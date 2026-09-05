"""Convert existing Aso Ebi configuration and answers into GuestRequirement rows.

The legacy ``Event.collect_aso_ebi`` / ``Guest.aso_ebi_*`` columns are left
untouched. Nothing reads the new tables yet, so this is additive and safe to run
on a live database; the reverse simply removes what was created.

Idempotent: re-running does not duplicate requirements or responses.
"""

from django.db import migrations

# Stable key for the requirement created from the legacy Aso Ebi columns.
# Exports and later phases look the requirement up by this.
ASO_EBI_KEY = 'aso_ebi'


def backfill(apps, schema_editor):
    Event = apps.get_model('guests', 'Event')
    Guest = apps.get_model('guests', 'Guest')
    GuestRequirement = apps.get_model('guests', 'GuestRequirement')
    GuestRequirementResponse = apps.get_model('guests', 'GuestRequirementResponse')

    for event in Event.objects.filter(collect_aso_ebi=True).iterator():
        requirement, _ = GuestRequirement.objects.get_or_create(
            event=event,
            key=ASO_EBI_KEY,
            defaults={
                # Honour the organiser's wording where they set it.
                'label': (event.aso_ebi_label or '').strip() or 'Aso Ebi',
                'kind': 'quantity',
                'unit': (event.aso_ebi_unit or '').strip() or 'yards',
                'options': [],
                'required': False,
                # Fabric is ordered once per invitation, not per attendee.
                'applies_to': 'primary',
                'collect_on': 'both',
                'position': 0,
                'is_active': True,
            },
        )

        guests = Guest.objects.filter(
            event=event,
            aso_ebi_requested=True,
            aso_ebi_quantity__gt=0,
        ).only('id', 'aso_ebi_quantity')

        existing = set(
            GuestRequirementResponse.objects
            .filter(requirement=requirement)
            .values_list('guest_id', flat=True)
        )

        GuestRequirementResponse.objects.bulk_create(
            [
                GuestRequirementResponse(
                    requirement=requirement,
                    guest=guest,
                    value_int=guest.aso_ebi_quantity,
                    value_json=[],
                )
                for guest in guests.iterator()
                if guest.id not in existing
            ],
            batch_size=500,
        )


def unbackfill(apps, schema_editor):
    GuestRequirement = apps.get_model('guests', 'GuestRequirement')
    # Responses cascade with the requirement.
    GuestRequirement.objects.filter(key=ASO_EBI_KEY).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('guests', '0023_guestrequirement_guestrequirementresponse_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill, unbackfill),
    ]
