from django.db import migrations, models
import django.db.models.deletion


def create_legacy_organization(apps, schema_editor):
    Organization = apps.get_model('accounts', 'Organization')
    Membership = apps.get_model('accounts', 'Membership')
    User = apps.get_model('accounts', 'User')

    organization, _ = Organization.objects.get_or_create(
        slug='event-pro-workspace',
        defaults={
            'name': 'Event Pro Workspace',
            'timezone': 'Africa/Lagos',
            'is_active': True,
        },
    )
    role_map = {
        'super_admin': 'owner',
        'event_manager': 'manager',
        'check_in_staff': 'check_in',
        'scanner': 'scanner',
        'viewer': 'viewer',
    }
    for user in User.objects.all().iterator():
        Membership.objects.get_or_create(
            organization=organization,
            user=user,
            defaults={
                'role': role_map.get(user.role, 'viewer'),
                'is_active': user.is_active,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_add_scanner_role'),
    ]

    operations = [
        migrations.CreateModel(
            name='Organization',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=160)),
                ('slug', models.SlugField(max_length=180, unique=True)),
                ('timezone', models.CharField(default='Africa/Lagos', max_length=64)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='organizations_created', to='accounts.user')),
            ],
            options={
                'ordering': ['name', 'id'],
            },
        ),
        migrations.CreateModel(
            name='Membership',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('owner', 'Owner'), ('admin', 'Administrator'), ('manager', 'Event Manager'), ('check_in', 'Check-In Staff'), ('scanner', 'Scanner'), ('viewer', 'Viewer')], default='viewer', max_length=20)),
                ('is_active', models.BooleanField(default=True)),
                ('joined_at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='memberships', to='accounts.organization')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='memberships', to='accounts.user')),
            ],
            options={
                'ordering': ['organization__name', 'user__username'],
            },
        ),
        migrations.AddConstraint(
            model_name='membership',
            constraint=models.UniqueConstraint(fields=('organization', 'user'), name='unique_organization_membership'),
        ),
        migrations.RunPython(create_legacy_organization, migrations.RunPython.noop),
    ]
