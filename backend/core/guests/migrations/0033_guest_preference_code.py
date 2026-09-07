import secrets

import guests.models
from django.db import migrations, models


ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'


def populate_preference_codes(apps, schema_editor):
    Guest = apps.get_model('guests', 'Guest')
    used = set()
    batch = []
    for guest in Guest.objects.all().iterator(chunk_size=1000):
        code = ''.join(secrets.choice(ALPHABET) for _ in range(6))
        while code in used:
            code = ''.join(secrets.choice(ALPHABET) for _ in range(6))
        used.add(code)
        guest.preference_code = code
        batch.append(guest)
        if len(batch) == 1000:
            Guest.objects.bulk_update(batch, ['preference_code'], batch_size=1000)
            batch = []
    if batch:
        Guest.objects.bulk_update(batch, ['preference_code'], batch_size=1000)


class Migration(migrations.Migration):

    dependencies = [
        ('guests', '0032_event_preferences_deadline'),
    ]

    operations = [
        migrations.AddField(
            model_name='guest',
            name='preference_code',
            field=models.CharField(blank=True, editable=False, max_length=6, null=True, unique=True),
        ),
        migrations.RunPython(populate_preference_codes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='guest',
            name='preference_code',
            field=models.CharField(
                default=guests.models.generate_preference_code,
                editable=False,
                max_length=6,
                unique=True,
            ),
        ),
    ]
