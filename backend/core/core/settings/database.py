import os
import sys
from .base import BASE_DIR

# ---------------------------------------------------------------------------
# Database
#
# Local development still defaults to SQLite for zero-setup runs, but the test
# suite defaults to PostgreSQL so it exercises the same engine as production.
# Constraints, partial indexes and select_for_update all behave differently on
# SQLite, so tenant-isolation work must not be validated against it.
#
# Override with DATABASE_ENGINE (sqlite|postgresql). Setting TEST_DATABASE_ENGINE
# =sqlite gives you the old fast-but-unfaithful test run when you need it.
# ---------------------------------------------------------------------------
_testing = 'test' in sys.argv or bool(os.environ.get('PYTEST_CURRENT_TEST'))

if _testing:
    # Deliberately ignore DATABASE_ENGINE here. Most local .env files set it to
    # sqlite for day-to-day dev, and inheriting that would silently drop the
    # suite back onto an engine production never uses. Opt out explicitly with
    # TEST_DATABASE_ENGINE=sqlite.
    DATABASE_ENGINE = os.environ.get('TEST_DATABASE_ENGINE', 'postgresql')
else:
    DATABASE_ENGINE = os.environ.get('DATABASE_ENGINE', 'sqlite')

if DATABASE_ENGINE == 'postgresql':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', 'guest_management'),
            'USER': os.environ.get('DB_USER', 'postgres'),
            'PASSWORD': os.environ.get('DB_PASSWORD', ''),
            'HOST': os.environ.get('DB_HOST', 'localhost'),
            'PORT': os.environ.get('DB_PORT', '5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
