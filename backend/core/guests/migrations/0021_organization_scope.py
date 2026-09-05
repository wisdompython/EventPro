from django.db import migrations, models
import django.db.models.deletion
import accounts.models


def assign_legacy_organization(apps, schema_editor):
    Organization = apps.get_model('accounts', 'Organization')
    organization = Organization.objects.filter(slug='event-pro-workspace').first()
    if organization is None:
        organization = Organization.objects.create(
            name='Event Pro Workspace',
            slug='event-pro-workspace',
            timezone='Africa/Lagos',
            is_active=True,
        )

    for model_name in ('Event', 'Font', 'TemplateCategory', 'WhatsAppTemplate'):
        model = apps.get_model('guests', model_name)
        model.objects.filter(organization__isnull=True).update(organization=organization)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_organization_membership'),
        ('guests', '0020_named_plus_one_and_rsvp_theme'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='organization',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='events', to='accounts.organization'),
        ),
        migrations.AddField(
            model_name='font',
            name='organization',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='fonts', to='accounts.organization'),
        ),
        migrations.AddField(
            model_name='templatecategory',
            name='organization',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='template_categories', to='accounts.organization'),
        ),
        migrations.AddField(
            model_name='whatsapptemplate',
            name='organization',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='whatsapp_templates', to='accounts.organization'),
        ),
        migrations.AlterField(
            model_name='font',
            name='name',
            field=models.CharField(max_length=100),
        ),
        migrations.AlterField(
            model_name='templatecategory',
            name='name',
            field=models.CharField(max_length=100),
        ),
        migrations.AlterField(
            model_name='whatsapptemplate',
            name='name',
            field=models.CharField(help_text='Exact template name as in Meta Business Manager', max_length=200),
        ),
        migrations.RunPython(assign_legacy_organization, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='event',
            name='organization',
            field=models.ForeignKey(default=accounts.models.get_default_organization_id, on_delete=django.db.models.deletion.CASCADE, related_name='events', to='accounts.organization'),
        ),
        migrations.AlterField(
            model_name='font',
            name='organization',
            field=models.ForeignKey(default=accounts.models.get_default_organization_id, on_delete=django.db.models.deletion.CASCADE, related_name='fonts', to='accounts.organization'),
        ),
        migrations.AlterField(
            model_name='templatecategory',
            name='organization',
            field=models.ForeignKey(default=accounts.models.get_default_organization_id, on_delete=django.db.models.deletion.CASCADE, related_name='template_categories', to='accounts.organization'),
        ),
        migrations.AlterField(
            model_name='whatsapptemplate',
            name='organization',
            field=models.ForeignKey(default=accounts.models.get_default_organization_id, on_delete=django.db.models.deletion.CASCADE, related_name='whatsapp_templates', to='accounts.organization'),
        ),
        migrations.AddConstraint(
            model_name='font',
            constraint=models.UniqueConstraint(fields=('organization', 'name'), name='unique_font_name_per_organization'),
        ),
        migrations.AddConstraint(
            model_name='templatecategory',
            constraint=models.UniqueConstraint(fields=('organization', 'name'), name='unique_template_category_per_organization'),
        ),
        migrations.AddConstraint(
            model_name='whatsapptemplate',
            constraint=models.UniqueConstraint(fields=('organization', 'name'), name='unique_whatsapp_template_per_organization'),
        ),
    ]
