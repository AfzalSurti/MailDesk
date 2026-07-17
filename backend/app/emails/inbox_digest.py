"""Build a compact per-account inbox digest for cheaper chat prompts."""

from __future__ import annotations

from collections import Counter
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import GmailAccount
from app.emails.models import EmailMessage

_DIGEST_DETAIL_LIMIT = 12
_PREVIEW = 100


def _preview(text: str | None) -> str:
    if not text:
        return ""
    return " ".join(str(text).split())[:_PREVIEW]


def build_inbox_digest(emails: list[EmailMessage]) -> str:
    """Compact summary: stats + only emails that need attention / high priority."""
    total = len(emails)
    unreplied = [e for e in emails if not (e.has_reply or e.replied_at or e.is_done)]
    replied = sum(1 for e in emails if e.has_reply or e.replied_at)
    done = sum(1 for e in emails if e.is_done)
    high = [e for e in emails if (e.category_priority or "").lower() == "high"]

    by_cat = Counter((e.category_name or "Uncategorized") for e in emails)
    cat_line = ", ".join(f"{name}:{count}" for name, count in by_cat.most_common(8))

    lines = [
        f"STATS total={total} unreplied={len(unreplied)} replied={replied} done={done} high_priority={len(high)}",
        f"CATEGORIES {cat_line or 'none'}",
        "NEEDS_ATTENTION (newest first):",
    ]

    # Prefer unreplied, then high priority not already listed
    detail: list[EmailMessage] = []
    seen: set[str] = set()
    for email in unreplied + high:
        uid = str(email.gmail_uid)
        if uid in seen:
            continue
        seen.add(uid)
        detail.append(email)
        if len(detail) >= _DIGEST_DETAIL_LIMIT:
            break

    if not detail:
        lines.append("(none — inbox is clear)")
    else:
        for idx, email in enumerate(detail, start=1):
            received = email.received_at.isoformat() if email.received_at else email.date_header
            lines.append(
                f"{idx}. uid={email.gmail_uid} | {received} | from={email.from_address} | "
                f"subj={email.subject} | cat={email.category_name or '-'} | "
                f"pri={email.category_priority or '-'} | {_preview(email.body_preview)}"
            )

    # Tiny index of remaining subjects so the model can still find topics
    others = [e for e in emails if str(e.gmail_uid) not in seen][:20]
    if others:
        lines.append("OTHER_SUBJECTS:")
        for email in others:
            lines.append(
                f"- uid={email.gmail_uid} | {email.from_address} | {email.subject} | "
                f"{email.category_name or '-'}"
            )

    return "\n".join(lines)


async def refresh_inbox_digest(
    db: AsyncSession,
    account: GmailAccount,
    emails: list[EmailMessage] | None = None,
) -> str:
    from app.emails.sync_service import list_account_emails

    if emails is None:
        emails = await list_account_emails(db, account.id)

    digest = build_inbox_digest(emails)
    account.inbox_digest = digest
    account.inbox_digest_updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(account)
    return digest
