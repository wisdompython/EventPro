from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('guests', '0029_event_seating_plan_dimensions'),
    ]

    operations = [
        migrations.AddField(
            model_name='seatingsection',
            name='path_points',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AlterField(
            model_name='seatingsection',
            name='feature',
            field=models.CharField(
                blank=True,
                choices=[
                    ('stage', 'Stage / band'),
                    ('dancefloor', 'Dance floor'),
                    ('walkway', 'Walkway / aisle'),
                    ('path', 'Route / path'),
                    ('entrance', 'Entrance'),
                    ('exit', 'Exit'),
                    ('guestexit', 'Guest exit'),
                    ('serviceexit', 'Service exit'),
                    ('bar', 'Bar'),
                    ('buffet', 'Buffet / catering'),
                    ('cake', 'Cake table'),
                    ('gifts', 'Gift table'),
                    ('photo', 'Photo booth'),
                    ('restroom', 'Restrooms'),
                    ('area', 'Area boundary'),
                    ('restricted', 'Restricted area'),
                    ('other', 'Other'),
                ],
                max_length=20,
            ),
        ),
    ]
