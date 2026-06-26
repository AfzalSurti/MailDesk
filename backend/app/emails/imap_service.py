import imaplib
import email
from email.header import decode_header
import re
from typing import List, Dict
from app.accounts.service import decrypt_password


def clean_text(text: str) -> str:
    if not text:
        return ""
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def decode_mime_header(value: str) -> str:
    if not value:
        return ""
    decoded_parts = decode_header(value)
    result = ""
    for part, charset in decoded_parts:
        if isinstance(part, bytes):
            result += part.decode(charset or "utf-8", errors="ignore")
        else:
            result += part
    return result


def get_email_body(msg) -> str:
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            disposition = str(part.get("Content-Disposition", ""))
            if content_type == "text/plain" and "attachment" not in disposition:
                try:
                    body = part.get_payload(decode=True).decode(
                        part.get_content_charset() or "utf-8", errors="ignore"
                    )
                    break
                except Exception:
                    continue
        # fallback to HTML if no plain text
        if not body:
            for part in msg.walk():
                if part.get_content_type() == "text/html":
                    try:
                        html = part.get_payload(decode=True).decode(
                            part.get_content_charset() or "utf-8", errors="ignore"
                        )
                        # Strip HTML tags
                        body = re.sub(r'<[^>]+>', ' ', html)
                        break
                    except Exception:
                        continue
    else:
        try:
            body = msg.get_payload(decode=True).decode(
                msg.get_content_charset() or "utf-8", errors="ignore"
            )
        except Exception:
            body = ""

    return clean_text(body)


def fetch_emails(email_address: str, encrypted_password: str, limit: int = 50) -> List[Dict]:
    app_password = decrypt_password(encrypted_password)
    
    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    mail.login(email_address, app_password)
    mail.select("INBOX")

    # Fetch latest emails
    _, message_ids = mail.search(None, "ALL")
    all_ids = message_ids[0].split()
    
    # Take last `limit` emails (most recent)
    selected_ids = all_ids[-limit:] if len(all_ids) > limit else all_ids
    selected_ids = list(reversed(selected_ids))  # newest first

    emails = []
    for uid in selected_ids:
        try:
            _, msg_data = mail.fetch(uid, "(RFC822)")
            raw = msg_data[0][1]
            msg = email.message_from_bytes(raw)

            subject = decode_mime_header(msg.get("Subject", "(No Subject)"))
            sender = decode_mime_header(msg.get("From", ""))
            date = msg.get("Date", "")
            body = get_email_body(msg)

            emails.append({
                "uid": uid.decode(),
                "subject": subject,
                "sender": sender,
                "date": date,
                "body_preview": body[:500]
            })
        except Exception:
            continue

    mail.logout()
    return emails


def delete_email(email_address: str, encrypted_password: str, uid: str) -> bool:
    try:
        app_password = decrypt_password(encrypted_password)
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(email_address, app_password)
        mail.select("INBOX")

        mail.store(uid, '+FLAGS', '\\Deleted')
        mail.expunge()
        mail.logout()
        return True
    except Exception:
        return False