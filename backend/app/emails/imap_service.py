import imaplib
import email
from email.header import decode_header
from html import unescape
from html.parser import HTMLParser
import re
from datetime import datetime, timedelta
from typing import Dict, Iterator, List, Tuple
from app.accounts.service import decrypt_password


class _HTMLToText(HTMLParser):
    """Convert HTML to readable plain text while preserving paragraph breaks."""

    BLOCK_TAGS = frozenset(
        {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"}
    )
    SKIP_TAGS = frozenset({"script", "style", "head", "meta", "title"})

    def __init__(self):
        super().__init__()
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
        elif tag in self.BLOCK_TAGS and not self._skip_depth:
            self._parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
        elif tag in self.BLOCK_TAGS and not self._skip_depth:
            self._parts.append("\n")

    def handle_data(self, data):
        if not self._skip_depth:
            self._parts.append(data)

    def get_text(self) -> str:
        return "".join(self._parts)


def normalize_plain_text(text: str) -> str:
    if not text:
        return ""
    lines = [re.sub(r"[^\S\n]+", " ", line).strip() for line in text.splitlines()]
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def html_to_text(html: str) -> str:
    if not html:
        return ""
    parser = _HTMLToText()
    try:
        parser.feed(unescape(html))
        parser.close()
    except Exception:
        return normalize_plain_text(re.sub(r"<[^>]+>", " ", unescape(html)))
    return normalize_plain_text(parser.get_text())


def decode_part(part) -> str:
    payload = part.get_payload(decode=True)
    if payload is None:
        raw = part.get_payload()
        return raw if isinstance(raw, str) else ""
    charset = part.get_content_charset() or "utf-8"
    return payload.decode(charset, errors="ignore")


def extract_email_content(msg) -> Tuple[str, str]:
    """Return (plain_text, html) for an email message."""
    plain_parts: list[str] = []
    html_parts: list[str] = []

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            disposition = str(part.get("Content-Disposition", ""))
            if "attachment" in disposition:
                continue
            try:
                if content_type == "text/plain":
                    plain_parts.append(decode_part(part))
                elif content_type == "text/html":
                    html_parts.append(decode_part(part))
            except Exception:
                continue
    else:
        try:
            payload = decode_part(msg)
            content_type = msg.get_content_type()
            if content_type == "text/html":
                html_parts.append(payload)
            else:
                plain_parts.append(payload)
        except Exception:
            pass

    body_html = html_parts[0] if html_parts else ""
    body_text = normalize_plain_text("\n\n".join(plain_parts)) if plain_parts else ""

    if not body_text and body_html:
        body_text = html_to_text(body_html)

    return body_text, body_html


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


def normalize_message_id(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().strip("<>").strip().lower()


def extract_reference_ids(msg) -> list[str]:
    ids: list[str] = []
    in_reply_to = normalize_message_id(msg.get("In-Reply-To"))
    if in_reply_to:
        ids.append(in_reply_to)
    references = msg.get("References") or ""
    for token in references.replace("\n", " ").replace("\r", " ").split():
        ref = normalize_message_id(token)
        if ref:
            ids.append(ref)
    # preserve order, drop dups
    seen = set()
    unique: list[str] = []
    for item in ids:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique


def iter_fetch_emails(
    email_address: str,
    encrypted_password: str,
    days: int = 3,
    limit: int = 200,
) -> Iterator[Dict]:
    app_password = decrypt_password(encrypted_password)

    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    mail.login(email_address, app_password)
    mail.select("INBOX")

    since_date = (datetime.now() - timedelta(days=days)).strftime("%d-%b-%Y")
    _, message_ids = mail.search(None, f"(SINCE {since_date})")
    all_ids = message_ids[0].split() if message_ids[0] else []

    selected_ids = all_ids[-limit:] if len(all_ids) > limit else all_ids
    selected_ids = list(reversed(selected_ids))

    try:
        for uid in selected_ids:
            try:
                _, msg_data = mail.fetch(uid, "(RFC822)")
                raw = msg_data[0][1]
                msg = email.message_from_bytes(raw)

                subject = decode_mime_header(msg.get("Subject", "(No Subject)"))
                sender = decode_mime_header(msg.get("From", ""))
                date = msg.get("Date", "")
                message_id = normalize_message_id(msg.get("Message-ID"))
                body_text, body_html = extract_email_content(msg)
                preview_source = body_text or html_to_text(body_html)

                yield {
                    "uid": uid.decode(),
                    "message_id": message_id,
                    "subject": subject,
                    "sender": sender,
                    "date": date,
                    "body_preview": preview_source[:500],
                    "body": body_text,
                    "body_html": body_html,
                }
            except Exception:
                continue
    finally:
        mail.logout()


def _select_sent_mailbox(mail: imaplib.IMAP4_SSL) -> bool:
    for mailbox in ('"[Gmail]/Sent Mail"', '"[Gmail]/Sent Mail"', "Sent", '"Sent Items"'):
        try:
            status, _ = mail.select(mailbox)
            if status == "OK":
                return True
        except Exception:
            continue
    return False


def fetch_sent_replies(
    email_address: str,
    encrypted_password: str,
    days: int = 3,
    limit: int = 200,
) -> List[Dict]:
    """Fetch recent Sent Mail replies within the same day window — not the whole mailbox."""
    app_password = decrypt_password(encrypted_password)
    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    mail.login(email_address, app_password)

    if not _select_sent_mailbox(mail):
        mail.logout()
        return []

    since_date = (datetime.now() - timedelta(days=days)).strftime("%d-%b-%Y")
    _, message_ids = mail.search(None, f"(SINCE {since_date})")
    all_ids = message_ids[0].split() if message_ids[0] else []
    selected_ids = all_ids[-limit:] if len(all_ids) > limit else all_ids

    replies: list[dict] = []
    try:
        for uid in selected_ids:
            try:
                _, msg_data = mail.fetch(uid, "(RFC822)")
                raw = msg_data[0][1]
                msg = email.message_from_bytes(raw)
                ref_ids = extract_reference_ids(msg)
                if not ref_ids:
                    continue

                subject = decode_mime_header(msg.get("Subject", ""))
                date = msg.get("Date", "")
                body_text, body_html = extract_email_content(msg)
                replies.append(
                    {
                        "uid": uid.decode() if isinstance(uid, bytes) else str(uid),
                        "subject": subject,
                        "date": date,
                        "body": body_text,
                        "body_html": body_html,
                        "in_reply_to_ids": ref_ids,
                    }
                )
            except Exception:
                continue
    finally:
        mail.logout()

    return replies


def fetch_emails(
    email_address: str,
    encrypted_password: str,
    days: int = 3,
    limit: int = 200,
) -> List[Dict]:
    return list(
        iter_fetch_emails(
            email_address,
            encrypted_password,
            days=days,
            limit=limit,
        )
    )


def delete_email(email_address: str, encrypted_password: str, uid: str) -> bool:
    try:
        app_password = decrypt_password(encrypted_password)
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(email_address, app_password)
        mail.select("INBOX")

        mail.store(uid, "+FLAGS", "\\Deleted")
        mail.expunge()
        mail.logout()
        return True
    except Exception:
        return False
