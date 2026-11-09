from django.apps import AppConfig


class PublicSitesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'public_sites'
    verbose_name = 'Organization public sites'

    def ready(self):
        from django.db.models.signals import post_save

        from accounts.models import Organization

        post_save.connect(
            _ensure_platform_domain,
            sender=Organization,
            dispatch_uid='public_sites_ensure_platform_domain',
        )


def _ensure_platform_domain(sender, instance, created, **kwargs):
    if not created or kwargs.get('raw'):
        return
    from .services import ensure_platform_domain

    ensure_platform_domain(instance)
