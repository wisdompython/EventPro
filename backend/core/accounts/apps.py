from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'

    def ready(self):
        """Bound the lifetime of the resolved-messaging-settings cache.

        messaging_settings_for() memoises per thread so a dispatcher loop does
        not re-query for every row. Without these hooks the memo would outlive
        the request/task in a long-lived worker and serve a value the admin
        changed hours ago.
        """
        from django.core.signals import request_finished, request_started
        from django.test.signals import setting_changed

        request_started.connect(_clear_messaging_cache, dispatch_uid='messaging_settings_request_started')
        request_finished.connect(_clear_messaging_cache, dispatch_uid='messaging_settings_request_finished')
        # Platform defaults come from django.conf.settings, so a changed
        # setting (override_settings in tests, or a reload) must invalidate
        # anything already resolved from the old value.
        setting_changed.connect(_clear_messaging_cache, dispatch_uid='messaging_settings_setting_changed')

        try:
            from celery.signals import task_postrun, task_prerun
        except ImportError:  # Celery is optional for management commands
            return
        task_prerun.connect(_clear_messaging_cache, dispatch_uid='messaging_settings_task_prerun')
        task_postrun.connect(_clear_messaging_cache, dispatch_uid='messaging_settings_task_postrun')


def _clear_messaging_cache(*args, **kwargs):
    from .messaging_settings import clear_cache

    clear_cache()
