# Generated manually so this feature can sit on top of the in-progress event
# slug migration without rewriting any existing workspace migrations.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('guests', '0036_event_slug'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='rsvp_hero_image',
            field=models.ImageField(
                blank=True,
                help_text='Optional shared cover image for the public RSVP page.',
                null=True,
                upload_to='rsvp_heroes/',
            ),
        ),
        migrations.AddField(
            model_name='event',
            name='rsvp_logo',
            field=models.ImageField(
                blank=True,
                help_text='Optional logo shown in the public RSVP page header.',
                null=True,
                upload_to='rsvp_logos/',
            ),
        ),
    ]
