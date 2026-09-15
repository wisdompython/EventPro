import logging
import mimetypes
from django.conf import settings
from django.utils import timezone
from django.utils.text import slugify

logger = logging.getLogger(__name__)


def build_preferences_url(guest) -> str:
    event_slug = slugify(guest.event.name)[:48] if guest.event else 'event'
    guest_slug = slugify(guest.full_name)[:40] or 'guest'
    return (
        f"{settings.SITE_URL.rstrip('/')}/{event_slug or 'event'}/preferences/"
        f"{guest_slug}-{guest.preference_code}"
    )

# ---------------------------------------------------------------------------
# Lazy client — only initialised when first used so the app starts fine even
# if the WhatsApp env vars are not configured yet.
# ---------------------------------------------------------------------------
_client = None


def _get_client():
    global _client
    if _client is None:
        from pywa import WhatsApp
        _client = WhatsApp(
            phone_id=settings.WHATSAPP_PHONE_ID,
            token=settings.WHATSAPP_TOKEN,
            app_id=settings.WHATSAPP_APP_ID,
            app_secret=settings.WHATSAPP_APP_SECRET,
        )
    return _client


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def send_pass(guest) -> bool:
    """
    Send the guest's branded pass via WhatsApp using the approved template.
    Returns True on success, False on failure (logs the error).
    """
    transport = getattr(settings, 'WHATSAPP_TRANSPORT', 'meta')
    if transport not in {'meta', 'log'}:
        logger.error('Unknown WhatsApp transport: %s', transport)
        return False

    if transport == 'meta' and (not settings.WHATSAPP_PHONE_ID or not settings.WHATSAPP_TOKEN):
        logger.warning("WhatsApp not configured — skipping send for guest %s", guest.id)
        return False

    if not guest.phone_number:
        logger.warning("Guest %s has no phone number — skipping WhatsApp send", guest.id)
        return False

    # A pass image is required. It can be sent by public URL in production or
    # uploaded directly from storage during local development.
    if not guest.pass_image:
        logger.warning("Guest %s has no pass image — skipping WhatsApp send", guest.id)
        return False

    # Don't send passes for events that have already ended
    from django.utils import timezone as tz
    event = guest.event
    if event and event.date and event.date < tz.now():
        logger.warning(
            "Event '%s' has passed — skipping WhatsApp pass for guest %s",
            event.name, guest.id,
        )
        return False

    if transport == 'log':
        logger.info(
            '[WhatsApp sandbox] pass to=%s guest=%s event=%s preferences_url=%s',
            _normalise_phone(guest.phone_number), guest.id,
            event.name if event else '', build_preferences_url(guest),
        )
        return True

    try:
        from pywa.types.templates import BodyText, TemplateLanguage

        phone = _normalise_phone(guest.phone_number)
        # Resolve template: event override → global default
        event = guest.event
        tmpl = event.whatsapp_template if (event and event.whatsapp_template_id) else None

        if tmpl:
            template_name = tmpl.name
            body_param_values = _resolve_template_params(guest, tmpl.body_params or [])
            has_header_image = tmpl.has_header_image
        else:
            # Fall back to global default — image header + guest_name + event_name
            template_name = settings.WHATSAPP_PASS_TEMPLATE
            event_name = event.name if event else 'the event'
            body_param_values = [guest.full_name, event_name]
            has_header_image = True

        params = []
        if has_header_image:
            params.append(_image_header_params(guest.pass_image, _build_pass_url(guest)))
        if body_param_values:
            params.append(BodyText.params(*body_param_values))

        logger.info("Sending WhatsApp pass to %s | template=%s", phone, template_name)

        wa = _get_client()
        wa.send_template(to=phone, name=template_name, language=TemplateLanguage.ENGLISH, params=params)
        logger.info("WhatsApp pass sent to guest %s (%s)", guest.id, phone)
        return True

    except Exception as exc:
        # Let WhatsAppError propagate so callers (e.g. send_whatsapp_pass) can
        # tell transient failures (worth retrying) from permanent ones.
        from pywa.errors import WhatsAppError
        if isinstance(exc, WhatsAppError):
            raise
        logger.error("WhatsApp send failed for guest %s: %s", guest.id, exc, exc_info=True)
        return False


def _resolve_template_params(guest, body_params: list) -> list:
    """Resolve ordered variable keys to actual guest/event values."""
    event = guest.event
    event_date = ''
    event_date_only = ''
    event_time = ''
    if event and event.date:
        local_event_date = timezone.localtime(event.date)
        event_date = local_event_date.strftime('%A, %d %B %Y at %I:%M %p')
        event_date_only = _format_ordinal_date(event.date)
        event_time = local_event_date.strftime('%I:%M %p').lstrip('0')

    var_map = {
        'guest_name':   guest.full_name or '',
        'event_name':   event.name if event else '',
        'event_date':   event_date,
        'event_date_only': event_date_only,
        'event_time':   event_time,
        'venue':        event.venue if event else '',
        'ticket_type':  guest.get_ticket_type_display() if hasattr(guest, 'get_ticket_type_display') else (guest.ticket_type or ''),
        'table_number': guest.table_number or '',
        'seat_number':  guest.seat_number or '',
        'preferences_link': build_preferences_url(guest),
    }
    var_map.update(_location_vars(event))
    return [var_map.get(key, '') for key in body_params]


def _format_location_time(starts_at) -> str:
    """`25th June 2026, 11:00 AM` — the date matters when stops span days."""
    if not starts_at:
        return ''
    local_value = timezone.localtime(starts_at)
    time_part = local_value.strftime('%I:%M %p').lstrip('0')
    return f'{_format_ordinal_date(starts_at)}, {time_part}'


def _location_vars(event) -> dict:
    """Resolve `schedule` and the indexed `location_N_*` template variables.

    An event with no locations falls back to its own venue/date, so a template
    written for a multi-stop wedding still renders sensibly for a single-venue
    dinner instead of leaving blanks mid-sentence.
    """
    from .models import WhatsAppTemplate

    stops = []
    if event is not None:
        stops = [
            {
                'name': location.name,
                'venue': location.venue,
                'time': _format_location_time(location.starts_at),
            }
            for location in event.locations.all()
        ]
        if not stops and (event.venue or event.date):
            stops = [{
                'name': '',
                'venue': event.venue or '',
                'time': _format_location_time(event.date),
            }]

    lines = []
    for stop in stops:
        # "Church: St Mary's, 25th June 2026, 11:00 AM", skipping empty parts
        # so a stop with no venue or no confirmed time still reads cleanly.
        detail = ', '.join(part for part in (stop['venue'], stop['time']) if part)
        if stop['name'] and detail:
            lines.append(f"{stop['name']}: {detail}")
        elif stop['name'] or detail:
            lines.append(stop['name'] or detail)

    resolved = {'schedule': '\n'.join(lines)}
    for index in range(WhatsAppTemplate.MAX_TEMPLATE_LOCATIONS):
        stop = stops[index] if index < len(stops) else {'name': '', 'venue': '', 'time': ''}
        resolved[f'location_{index + 1}_name'] = stop['name']
        resolved[f'location_{index + 1}_venue'] = stop['venue']
        resolved[f'location_{index + 1}_time'] = stop['time']
    return resolved


def _format_ordinal_date(value) -> str:
    """Format a date as `25th June 2026`, without a weekday."""
    local_value = timezone.localtime(value)
    day = local_value.day
    if 10 <= day % 100 <= 20:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(day % 10, 'th')
    return f'{day}{suffix} {local_value.strftime("%B %Y")}'


def send_reminder(guest, template_name: str) -> bool:
    """Send a reminder WhatsApp template message to a guest."""
    transport = getattr(settings, 'WHATSAPP_TRANSPORT', 'meta')
    if transport not in {'meta', 'log'}:
        logger.error('Unknown WhatsApp transport: %s', transport)
        return False
    if transport == 'meta' and (not settings.WHATSAPP_PHONE_ID or not settings.WHATSAPP_TOKEN):
        logger.warning("WhatsApp not configured — skipping reminder for guest %s", guest.id)
        return False

    if not guest.phone_number:
        return False

    if transport == 'log':
        logger.info(
            '[WhatsApp sandbox] reminder to=%s guest=%s template=%s',
            _normalise_phone(guest.phone_number), guest.id, template_name,
        )
        return True

    try:
        from pywa.types.templates import BodyText, TemplateLanguage
        from .models import WhatsAppTemplate

        phone = _normalise_phone(guest.phone_number)

        # Look up registered template config for param mapping
        try:
            tmpl = WhatsAppTemplate.objects.get(name=template_name, is_active=True)
            body_param_values = _resolve_template_params(guest, tmpl.body_params or [])
            has_header_image = tmpl.has_header_image
        except WhatsAppTemplate.DoesNotExist:
            # Fallback: default param order for unregistered templates
            event = guest.event
            event_date = timezone.localtime(event.date).strftime('%A, %d %B %Y at %I:%M %p') if (event and event.date) else ''
            body_param_values = [guest.full_name, event.name if event else '', event_date]
            has_header_image = False

        params = []
        if has_header_image:
            # Image-header reminder templates resend the guest's generated
            # event pass. The pass contains the QR code, so never submit an
            # image template without a usable pass image/header parameter.
            if not guest.pass_image:
                logger.warning(
                    "Guest %s has no pass image — skipping image reminder",
                    guest.id,
                )
                return False
            params.append(_image_header_params(guest.pass_image, _build_pass_url(guest)))

        if body_param_values:
            params.append(BodyText.params(*body_param_values))

        wa = _get_client()
        wa.send_template(
            to=phone,
            name=template_name,
            language=TemplateLanguage.ENGLISH,
            params=params,
        )
        logger.info("Reminder sent to guest %s via template %s", guest.id, template_name)
        return True

    except Exception as exc:
        logger.error("Reminder send failed for guest %s: %s", guest.id, exc, exc_info=True)
        return False


def send_message(phone_number: str, message: str) -> bool:
    """
    Send a free-form text message to a phone number.
    Only works within the 24-hour session window after the recipient
    has messaged the business number first.
    Returns True on success, False on failure.
    """
    transport = getattr(settings, 'WHATSAPP_TRANSPORT', 'meta')
    if transport not in {'meta', 'log'}:
        logger.error('Unknown WhatsApp transport: %s', transport)
        return False
    if transport == 'meta' and (not settings.WHATSAPP_PHONE_ID or not settings.WHATSAPP_TOKEN):
        logger.warning("WhatsApp not configured — skipping free-form send")
        return False

    if not phone_number or not message.strip():
        logger.warning("send_message: missing phone or message")
        return False

    if transport == 'log':
        logger.info(
            '[WhatsApp sandbox] message to=%s text=%s',
            _normalise_phone(phone_number), message,
        )
        return True

    try:
        phone = _normalise_phone(phone_number)
        wa = _get_client()
        wa.send_message(to=phone, text=message)
        logger.info("WhatsApp free-form message sent to %s", phone)
        return True
    except Exception as exc:
        logger.error("WhatsApp free-form send failed to %s: %s", phone_number, exc, exc_info=True)
        return False


def _normalise_phone(phone: str) -> str:
    """Strip spaces/dashes and ensure international format (no leading +)."""
    cleaned = phone.strip().replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
    if cleaned.startswith('+'):
        cleaned = cleaned[1:]
    # Convert local Nigerian 0XXXXXXXXXX → 234XXXXXXXXXX
    if cleaned.startswith('0') and len(cleaned) == 11:
        cleaned = '234' + cleaned[1:]
    return cleaned


def _build_pass_url(guest) -> str:
    """Build a browser-accessible URL for the guest's pass image.

    Meta delivery does not depend on this URL in local development: image
    bytes are uploaded directly when the configured base is not public.
    """
    base = settings.WHATSAPP_MEDIA_BASE_URL if hasattr(settings, 'WHATSAPP_MEDIA_BASE_URL') else ''
    if not base:
        if settings.DEBUG:
            base = 'http://localhost:8000'
        else:
            host = settings.ALLOWED_HOSTS[0] if settings.ALLOWED_HOSTS else ''
            base = f'https://{host}' if host else ''
    return f"{base.rstrip('/')}{settings.MEDIA_URL}{guest.pass_image.name}"


def _image_header_params(image_field, browser_url: str = ''):
    """Create a PyWA image header from a public URL or stored image bytes.

    Meta cannot fetch localhost URLs. PyWA can upload bytes to Meta before it
    sends the template, which makes real image-template testing work from a
    local Docker environment without an ngrok or Cloudflare tunnel.
    """
    from pywa.types.templates import HeaderImage

    is_public_url = (
        browser_url.startswith(('http://', 'https://'))
        and 'localhost' not in browser_url
        and '127.0.0.1' not in browser_url
    )
    if is_public_url:
        return HeaderImage.params(image=browser_url)

    image_field.open('rb')
    try:
        content = image_field.read()
    finally:
        image_field.close()
    if not content:
        raise ValueError('The generated image is empty.')
    mime_type = mimetypes.guess_type(image_field.name)[0] or 'image/png'
    return HeaderImage.params(image=content, mime_type=mime_type)
