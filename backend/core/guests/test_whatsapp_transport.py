from django.test import SimpleTestCase, override_settings

from .whatsapp import send_message


class WhatsAppLogTransportTests(SimpleTestCase):
    @override_settings(
        WHATSAPP_TRANSPORT='log',
        WHATSAPP_PHONE_ID='',
        WHATSAPP_TOKEN='',
    )
    def test_log_transport_simulates_send_without_meta_credentials(self):
        with self.assertLogs('guests.whatsapp', level='INFO') as logs:
            sent = send_message('+234 800 000 0000', 'Test event message')
        self.assertTrue(sent)
        self.assertIn('[WhatsApp sandbox]', '\n'.join(logs.output))

    @override_settings(WHATSAPP_TRANSPORT='invalid')
    def test_unknown_transport_fails_closed(self):
        with self.assertLogs('guests.whatsapp', level='ERROR'):
            self.assertFalse(send_message('+2348000000000', 'Test'))
