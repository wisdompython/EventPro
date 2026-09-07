from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('guests', '0031_seatingsection_path_arrows_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='preferences_deadline',
            field=models.DateTimeField(
                blank=True,
                help_text='Last time guests may submit the standalone preferences form.',
                null=True,
            ),
        ),
    ]
