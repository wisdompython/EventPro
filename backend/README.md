# Event Pro backend

## Password email and messaging sandboxes

Password-reset messages use Django email over Mailtrap SMTP. In Mailtrap, open
**Email Testing -> Sandboxes -> Integration -> SMTP**, then copy the sandbox
username and password into `backend/.env`:

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

The root `docker-compose.yml` loads `backend/.env` into Django, the Celery
worker, and Celery Beat. Restart those services after changing credentials:

```bash
docker compose up -d --force-recreate backend worker beat
```

Verify configuration without printing secrets:

```bash
docker compose exec backend python -c "import os; print({'transport': os.getenv('WHATSAPP_TRANSPORT', 'meta'), 'phone_id_set': bool(os.getenv('WHATSAPP_PHONE_ID')), 'token_set': bool(os.getenv('WHATSAPP_TOKEN')), 'media_url_set': bool(os.getenv('WHATSAPP_MEDIA_BASE_URL'))})"
```

## Event-day seating and privacy

Assigning a guest from the seating planner reserves the first available seat
number at that table. Removing the guest clears both the table and seat.

Scanner and door-desk endpoints return a restricted operational representation:
guest identity, ticket, event, seating area, table, seat, check-in state, party
state, and answered structured service questions such as meal choice. They do
not return phone numbers, email addresses, media links, preference links, or
free-text answers. This keeps useful arrival and service information visible
without exposing contact data or potentially private notes.
