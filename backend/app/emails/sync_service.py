from datetime import datetime
from email.utils import parsedate_to_datetime
import uuid

from sqlalchemy import delete, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import GmailAccount
from app.categories.models import AccountCategoryAssignment, Category
from app.emails.ai_service import ClassificationAPIError, classify_email, parse_category_uuid
from app.emails.imap_service import fetch_sent_replies, iter_fetch_emails
from app.emails.models import EmailMessage


def parse_email_date(date_header: str) -> datetime | None:
    if not date_header:
        return None
    try:
        dt = parsedate_to_datetime(date_header)
        if dt.tzinfo is not None:
            dt = dt.replace(tzinfo=None)
        return dt
    except Exception:
        return None


def sanitize_text(value: str | None) -> str:
    if not value:
        return ""
    return value.replace("\x00", "")


async def _load_categories(db: AsyncSession, account: GmailAccount) -> list[dict]:
    result = await db.execute(
        select(Category)
        .join(
            AccountCategoryAssignment,
            AccountCategoryAssignment.category_id == Category.id,
        )
        .where(Category.user_id == account.user_id)
        .where(AccountCategoryAssignment.account_id == account.id)
        .order_by(Category.created_at)
    )
    categories = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "priority": c.priority.value,
            "keywords": c.keywords or [],
        }
        for c in categories
    ]


async def list_account_emails(db: AsyncSession, account_id) -> list[EmailMessage]:
    result = await db.execute(
        select(EmailMessage)
        .where(EmailMessage.account_id == account_id)
        .order_by(
            EmailMessage.received_at.desc().nullslast(),
            EmailMessage.synced_at.desc(),
        )
    )
    return list(result.scalars().all())


async def _upsert_email(db: AsyncSession, account_id, raw: dict, synced_at: datetime) -> None:
    values = {
        "account_id": account_id,
        "gmail_uid": raw["uid"],
        "message_id": sanitize_text(raw.get("message_id"))[:500] or None,
        "subject": sanitize_text(raw.get("subject"))[:1000],
        "from_address": sanitize_text(raw.get("sender"))[:500],
        "date_header": sanitize_text(raw.get("date"))[:255],
        "received_at": parse_email_date(raw.get("date") or ""),
        "body": sanitize_text(raw.get("body")),
        "body_html": sanitize_text(raw.get("body_html")),
        "body_preview": sanitize_text(raw.get("body_preview"))[:500],
        "synced_at": synced_at,
    }

    stmt = insert(EmailMessage).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["account_id", "gmail_uid"],
        set_={
            "message_id": stmt.excluded.message_id,
            "subject": stmt.excluded.subject,
            "from_address": stmt.excluded.from_address,
            "date_header": stmt.excluded.date_header,
            "received_at": stmt.excluded.received_at,
            "body": stmt.excluded.body,
            "body_html": stmt.excluded.body_html,
            "body_preview": stmt.excluded.body_preview,
            "synced_at": stmt.excluded.synced_at,
        },
    )
    await db.execute(stmt)


async def _match_sent_replies(
    db: AsyncSession,
    account: GmailAccount,
    days: int = 3,
) -> None:
    """Match Sent Mail replies to already-synced inbox messages (same day window only)."""
    try:
        sent = fetch_sent_replies(
            account.email_address,
            account.app_password,
            days=days,
        )
    except Exception:
        return

    if not sent:
        return

    # Prefer the most recent reply for each original Message-ID
    reply_by_original: dict[str, dict] = {}
    for reply in sent:
        reply_at = parse_email_date(reply.get("date") or "")
        for original_id in reply.get("in_reply_to_ids") or []:
            existing = reply_by_original.get(original_id)
            if not existing:
                reply_by_original[original_id] = reply
                continue
            existing_at = parse_email_date(existing.get("date") or "")
            if reply_at and (not existing_at or reply_at > existing_at):
                reply_by_original[original_id] = reply

    if not reply_by_original:
        return

    result = await db.execute(
        select(EmailMessage).where(
            EmailMessage.account_id == account.id,
            EmailMessage.message_id.in_(list(reply_by_original.keys())),
        )
    )
    emails = result.scalars().all()

    for email in emails:
        reply = reply_by_original.get((email.message_id or "").lower())
        if not reply:
            continue
        reply_at = parse_email_date(reply.get("date") or "") or datetime.utcnow()
        email.has_reply = True
        email.reply_subject = sanitize_text(reply.get("subject"))[:1000]
        email.reply_body = sanitize_text(reply.get("body"))
        email.reply_body_html = sanitize_text(reply.get("body_html"))
        email.reply_at = reply_at
        email.replied_at = reply_at
        if not email.is_done:
            email.is_done = True
            email.done_at = reply_at

    await db.commit()


def compute_inbox_stats(emails: list[EmailMessage]) -> dict:
    total = len(emails)
    replied = sum(1 for e in emails if e.has_reply or e.replied_at)
    done = sum(1 for e in emails if e.is_done)
    unreplied = sum(1 for e in emails if not (e.has_reply or e.replied_at or e.is_done))
    return {
        "total": total,
        "replied": replied,
        "unreplied": unreplied,
        "done": done,
    }


async def _save_category(
    db: AsyncSession,
    account_id: uuid.UUID,
    gmail_uid: str,
    classification: dict,
) -> None:
    await db.execute(
        update(EmailMessage)
        .where(
            EmailMessage.account_id == account_id,
            EmailMessage.gmail_uid == gmail_uid,
        )
        .values(
            category_id=parse_category_uuid(classification.get("category_id")),
            category_name=classification.get("category_name"),
            category_priority=classification.get("priority"),
            confidence_score=classification.get("confidence_score"),
        )
    )


async def categorize_stored_email(
    db: AsyncSession,
    account: GmailAccount,
    account_id: uuid.UUID,
    gmail_uid: str,
) -> dict:
    result = await db.execute(
        select(EmailMessage).where(
            EmailMessage.account_id == account_id,
            EmailMessage.gmail_uid == gmail_uid,
        )
    )
    email = result.scalar_one_or_none()
    if not email:
        raise ValueError("Email not found")

    categories = await _load_categories(db, account)
    if not categories:
        raise ValueError("No categories configured")

    classification = await classify_email(
        subject=email.subject,
        sender=email.from_address,
        body_preview=email.body_preview,
        categories=categories,
        account_id=str(account_id),
        uid=gmail_uid,
        force=True,
    )
    await _save_category(db, account_id, gmail_uid, classification)
    await db.commit()
    return classification


async def _categorize_account_emails(
    db: AsyncSession,
    account: GmailAccount,
    gmail_uids: set[str],
) -> None:
    categories = await _load_categories(db, account)
    if not categories or not gmail_uids:
        return

    result = await db.execute(
        select(EmailMessage).where(
            EmailMessage.account_id == account.id,
            EmailMessage.gmail_uid.in_(gmail_uids),
            or_(
                EmailMessage.category_name.is_(None),
                EmailMessage.category_name == "",
            ),
        )
    )
    emails_to_classify = result.scalars().all()

    for email in emails_to_classify:
        classification = await classify_email(
            subject=email.subject,
            sender=email.from_address,
            body_preview=email.body_preview,
            categories=categories,
            account_id=str(account.id),
            uid=email.gmail_uid,
        )
        await _save_category(db, account.id, email.gmail_uid, classification)
        await db.commit()


async def sync_account_emails(
    db: AsyncSession,
    account: GmailAccount,
    days: int = 3,
) -> list[EmailMessage]:
    now = datetime.utcnow()
    fetched_uids: set[str] = set()

    # Phase 1: fetch all emails from Gmail and save to DB
    for raw in iter_fetch_emails(
        account.email_address,
        account.app_password,
        days=days,
    ):
        uid = raw["uid"]
        fetched_uids.add(uid)
        await _upsert_email(db, account.id, raw, now)
        await db.commit()

    if fetched_uids:
        await db.execute(
            delete(EmailMessage).where(
                EmailMessage.account_id == account.id,
                EmailMessage.gmail_uid.not_in(fetched_uids),
            )
        )
        await db.commit()

    # Phase 2: detect replies already sent from this Gmail account (same day window)
    await _match_sent_replies(db, account, days=days)

    # Phase 3: apply AI categorization after all emails are stored
    await _categorize_account_emails(db, account, fetched_uids)

    emails = await list_account_emails(db, account.id)
    from app.emails.inbox_digest import refresh_inbox_digest
    from app.emails.rag import index_account_emails

    await refresh_inbox_digest(db, account, emails)
    await index_account_emails(
        db,
        user_id=account.user_id,
        account_id=account.id,
        emails=emails,
    )
    return emails


async def recategorize_all_emails(
    db: AsyncSession,
    account: GmailAccount,
) -> list[EmailMessage]:
    categories = await _load_categories(db, account)
    if not categories:
        raise ValueError("No categories configured")

    result = await db.execute(
        select(EmailMessage)
        .where(EmailMessage.account_id == account.id)
        .order_by(
            EmailMessage.received_at.desc().nullslast(),
            EmailMessage.synced_at.desc(),
        )
    )
    emails = result.scalars().all()

    for email in emails:
        classification = await classify_email(
            subject=email.subject,
            sender=email.from_address,
            body_preview=email.body_preview,
            categories=categories,
            account_id=str(account.id),
            uid=email.gmail_uid,
            force=True,
        )
        await _save_category(db, account.id, email.gmail_uid, classification)
        await db.commit()

    emails = await list_account_emails(db, account.id)
    from app.emails.inbox_digest import refresh_inbox_digest
    from app.emails.rag import index_account_emails

    await refresh_inbox_digest(db, account, emails)
    await index_account_emails(
        db,
        user_id=account.user_id,
        account_id=account.id,
        emails=emails,
    )
    return emails
