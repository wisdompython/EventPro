from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('guests', '0028_seating_venue_areas_and_exits'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='seating_plan_height',
            field=models.PositiveIntegerField(default=950),
        ),
        migrations.AddField(
            model_name='event',
            name='seating_plan_width',
            field=models.PositiveIntegerField(default=1400),
        ),
    ]
