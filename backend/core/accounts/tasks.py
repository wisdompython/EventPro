import logging

from celery import shared_task
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMultiAlternatives
from django.utils.encoding import force_bytes
from django.utils.html import escape
from django.utils.http import urlsafe_base64_encode

from .models import User

logger = logging.getLogger(__name__)


@shared_task
def send_password_reset_email(email_address: str) -> bool:
    """Resolve and email a reset link away from the public request path.

    The job is queued for known and unknown addresses alike, limiting account
    enumeration through both response content and SMTP timing.
    """
    user = User.objects.filter(
        email__iexact=email_address,
        is_active=True,
    ).order_by('id').first()
    if user is None:
        return False

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    reset_url = f"{settings.SITE_URL.rstrip('/')}/reset-password?uid={uid}&token={token}"
    display_name = user.get_full_name().strip() or user.username
    html_display_name = escape(display_name)
    html_reset_url = escape(reset_url)
    subject = 'Reset your Event Pro password'
    text_body = (
        f'Hello {display_name},\n\n'
        'We received a request to reset your Event Pro password.\n'
        f'Open this secure link to choose a new password:\n{reset_url}\n\n'
        'If you did not request this, you can ignore this email. '
        'The link becomes invalid after your password is changed.\n'
    )
    html_body = (
        '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#211d2b">'
        '<div style="background:#171522;padding:24px;color:white">'
        '<strong style="font-size:20px">Event Pro</strong></div>'
        '<div style="padding:28px;border:1px solid #e5e1e8">'
        '<h1 style="font-size:24px">Reset your password</h1>'
        f'<p>Hello {html_display_name},</p>'
        '<p>Use the button below to choose a new Event Pro password.</p>'
        f'<p style="margin:28px 0"><a href="{html_reset_url}" '
        'style="background:#6757d9;color:white;text-decoration:none;padding:13px 20px;'
        'border-radius:4px;font-weight:bold">Choose a new password</a></p>'
        '<p style="color:#77707f;font-size:13px">'
        'If you did not request this, you can safely ignore this email.</p>'
        '</div></div>'
    )
    try:
        message = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        )
        message.attach_alternative(html_body, 'text/html')
        return bool(message.send(fail_silently=False))
    except Exception:
        logger.exception('Could not send password reset email for user %s', user.pk)
        return False
