from pathlib import Path
from dotenv import load_dotenv
import os
import sys

# Do not let .env clobber variables already exported in the real environment.
# Without override=False, `FOO=bar python manage.py ...` is silently ignored
# whenever FOO is also present in .env, which makes CI and one-off overrides
# behave differently from what the caller asked for.
load_dotenv(override=False)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
TESTING = 'test' in sys.argv or bool(os.environ.get('PYTEST_CURRENT_TEST'))

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-ek2qjqu48x#&cn8w=!cmc_3b8ql96=xy(=v9svgwzk_&b+)4k(')

DEBUG = os.environ.get('DEBUG', 'True') == 'True'

ALLOWED_HOSTS = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if h.strip()]

# Public URL of the frontend — used to build QR scan links
SITE_URL = os.environ.get('SITE_URL', 'http://localhost:3000')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django_celery_results',
    'django_celery_beat',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'corsheaders',
    # Local
    'accounts',
    'guests',
    'rsvp',
    'public_sites',
    # Reads across the others; nothing imports it.
    'platform_ops',
]

AUTH_USER_MODEL = 'accounts.User'

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = os.environ.get('APP_TIME_ZONE', 'Africa/Lagos')
USE_I18N = True
USE_TZ = True

# Trust the X-Forwarded-Proto header from Nginx so Django knows requests
# arrive over HTTPS. Required for secure cookies behind SSL termination.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True

# When running behind HTTPS, mark cookies as secure so the browser sends them.
_https = os.environ.get('HTTPS', 'False') == 'True'
CSRF_COOKIE_SECURE    = _https
SESSION_COOKIE_SECURE = _https
CSRF_COOKIE_SAMESITE  = 'Lax'

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        # Enforces CSRF on unsafe methods for cookie-authenticated requests.
        # The browser client bootstraps its token from GET /api/auth/csrf/.
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'accounts.permissions.IsAuthenticatedAnyRole',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    'PAGE_SIZE_QUERY_PARAM': 'page_size',
    'MAX_PAGE_SIZE': 200,
    'DEFAULT_THROTTLE_RATES': {
        'public_rsvp': os.environ.get('PUBLIC_RSVP_THROTTLE_RATE', '30/min'),
        'password_reset': os.environ.get('PASSWORD_RESET_THROTTLE_RATE', '5/hour'),
    },
}

# ---------------------------------------------------------------------------
# Messaging platform defaults
#
# These are the *platform* defaults for values an organization can override on
# Admin -> Messaging settings (accounts.OrganizationMessagingSettings). An org
# row stores NULL for "inherit the platform default", so raising a default here
# still propagates to every tenant that has not set its own value.
#
# Read them through accounts.messaging_settings.messaging_settings_for(org_id),
# never through settings.X directly, or the per-org override is bypassed.
# ---------------------------------------------------------------------------
RSVP_REMINDER_COOLDOWN_MINUTES = int(os.environ.get('RSVP_REMINDER_COOLDOWN_MINUTES', '360'))
RSVP_MAX_REMINDERS = int(os.environ.get('RSVP_MAX_REMINDERS', '3'))

# Automatic retries for sends Meta accepted and later reported as failed.
FAILED_SEND_MAX_AUTO_RETRIES = int(os.environ.get('FAILED_SEND_MAX_AUTO_RETRIES', '3'))
# Backoff (hours) between automatic retries, indexed by attempt count. The
# last entry repeats for any further attempt.
FAILED_SEND_RETRY_DELAY_HOURS = [1, 4, 12]
# Meta's per-user marketing cap (error 131049) clears on a daily-ish window,
# so those retries are spaced a day apart regardless of attempt number.
ECOSYSTEM_RETRY_DELAY_HOURS = [24, 24, 24]

# Per-organization sending pace, applied as an in-task spacing throttle on top
# of the worker-level Celery rate limit (see WHATSAPP_WORKER_RATE_LIMIT_PER_MINUTE).
WHATSAPP_MESSAGES_PER_MINUTE = int(os.environ.get('WHATSAPP_MESSAGES_PER_MINUTE', '20'))
RSVP_MESSAGES_PER_MINUTE = int(os.environ.get('RSVP_MESSAGES_PER_MINUTE', '20'))

# ---------------------------------------------------------------------------
# Platform ceilings — a tenant may not configure a value beyond these. Only a
# platform superuser can raise them, and only by changing the environment.
# ---------------------------------------------------------------------------
# Hard ceiling on the per-org daily send limit. Meta's top published tier is
# 100K unique users per rolling 24h; nothing above that is a real tier.
WHATSAPP_DAILY_SEND_LIMIT_CEILING = int(os.environ.get('WHATSAPP_DAILY_SEND_LIMIT_CEILING', '100000'))
# Repeated unanswered messages get business numbers blocked, so the reminder
# cap and cooldown floor are platform policy, not tenant preference.
RSVP_MAX_REMINDERS_CEILING = int(os.environ.get('RSVP_MAX_REMINDERS_CEILING', '5'))
RSVP_REMINDER_COOLDOWN_FLOOR_MINUTES = int(os.environ.get('RSVP_REMINDER_COOLDOWN_FLOOR_MINUTES', '60'))
FAILED_SEND_MAX_AUTO_RETRIES_CEILING = int(os.environ.get('FAILED_SEND_MAX_AUTO_RETRIES_CEILING', '10'))
# Celery applies task rate_limit per worker process, and the decorator argument
# is bound at import time. This is therefore a global, restart-only ceiling;
# the per-org messages-per-minute value throttles within it.
WHATSAPP_WORKER_RATE_LIMIT_PER_MINUTE = int(os.environ.get('WHATSAPP_WORKER_RATE_LIMIT_PER_MINUTE', '20'))
