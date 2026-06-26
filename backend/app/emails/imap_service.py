import email
import imaplib
from email.header import decode_header


def _decode_header_value(value: str | None) -> str:
    if not value:
        return ""
    parts = decode_header(value)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(part)
    return "".join(decoded)


def fetch_recent_emails(
    email_address: str,
    app_password: str,
    limit: int = 10,
    mailbox: str = "INBOX",
) -> list[dict]:
    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    try:
        mail.login(email_address, app_password)
        mail.select(mailbox)

        _, data = mail.search(None, "ALL")
        message_ids = data[0].split()
        recent_ids = message_ids[-limit:] if message_ids else []

        emails = []
        for msg_id in reversed(recent_ids):
            _, msg_data = mail.fetch(msg_id, "(RFC822)")
            if not msg_data or not msg_data[0]:
                continue

            raw = msg_data[0][1]
            msg = email.message_from_bytes(raw)

            body = ""
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() == "text/plain" and not part.get_filename():
                        payload = part.get_payload(decode=True)
                        if payload:
                            body = payload.decode(errors="replace")
                            break
            else:
                payload = msg.get_payload(decode=True)
                if payload:
                    body = payload.decode(errors="replace")

            emails.append(
                {
                    "id": msg_id.decode(),
                    "from": _decode_header_value(msg.get("From")),
                    "subject": _decode_header_value(msg.get("Subject")),
                    "date": _decode_header_value(msg.get("Date")),
                    "body_preview": body[:500],
                }
            )

        return emails
    finally:
        try:
            mail.logout()
        except Exception:
            pass
