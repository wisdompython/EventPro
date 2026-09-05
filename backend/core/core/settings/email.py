import os

from .base import TESTING


# Mailtrap is an email sandbox, used for password reset and other transactional
# email during development. WhatsApp delivery remains a separate Meta channel.
MAILTRAP_SMTP_USERNAME = os.environ.get('MAILTRAP_SMTP_USERNAME', '')
MAILTRAP_SMTP_PASSWORD = os.environ.get('MAILTRAP_SMTP_PASSWORD', '')

if TESTING:
    EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
elif MAILTRAP_SMTP_USERNAME and MAILTRAP_SMTP_PASSWORD:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
else:
    # A new checkout stays usable before Mailtrap credentials are supplied.
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

EMAIL_HOST = os.environ.get('MAILTRAP_SMTP_HOST', 'sandbox.smtp.mailtrap.io')
EMAIL_PORT = int(os.environ.get('MAILTRAP_SMTP_PORT', '2525'))
EMAIL_HOST_USER = MAILTRAP_SMTP_USERNAME
EMAIL_HOST_PASSWORD = MAILTRAP_SMTP_PASSWORD
EMAIL_USE_TLS = os.environ.get('MAILTRAP_SMTP_USE_TLS', 'True') == 'True'
EMAIL_TIMEOUT = int(os.environ.get('EMAIL_TIMEOUT', '10'))
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'Event Pro <no-reply@eventpro.local>')
# Django's signed reset token also checks the user's password and last login.
PASSWORD_RESET_TIMEOUT = int(os.environ.get('PASSWORD_RESET_TIMEOUT', '3600'))
