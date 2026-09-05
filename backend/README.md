# Event Pro backend

## Password email and messaging sandboxes

Password-reset messages use Django email over Mailtrap SMTP. In Mailtrap, open
**Email Testing -> Sandboxes -> Integration -> SMTP**, then copy the sandbox
username and password into the repository `.env`:

```env
MAILTRAP_SMTP_HOST=sandbox.smtp.mailtrap.io
MAILTRAP_SMTP_PORT=2525
MAILTRAP_SMTP_USERNAME=your-sandbox-username
MAILTRAP_SMTP_PASSWORD=your-sandbox-password
MAILTRAP_SMTP_USE_TLS=True
DEFAULT_FROM_EMAIL=Event Pro <no-reply@eventpro.local>
```

If the credentials are blank, development prints reset emails to the backend
console instead. Reset links expire after one hour by default.

Mailtrap handles email only; it cannot sandbox WhatsApp. Use the independent
WhatsApp log transport locally:

```env
WHATSAPP_TRANSPORT=log
```

This records simulated WhatsApp sends in the backend/worker logs without
contacting Meta. Set `WHATSAPP_TRANSPORT=meta` and provide the normal WhatsApp
Cloud API credentials for real delivery.
