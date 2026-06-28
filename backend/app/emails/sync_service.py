from datetime import datetime
from email.utils import parsedate_to_datetime
import uuid

from sqlalchemy import delete, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import GmailAccount
from app.categories.models import Category
from app.emails.ai_service import ClassificationAPIError, classify_email, parse_category_uuid
from app.emails.imap_service import iter_fetch_emails
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


async def _load_categories(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(Category).order_by(Category.created_at))
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

    categories = await _load_categories(db)
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
    account_id: uuid.UUID,
    gmail_uids: set[str],
) -> None:
    categories = await _load_categories(db)
    if not categories or not gmail_uids:
        return

    result = await db.execute(
        select(EmailMessage).where(
            EmailMessage.account_id == account_id,
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
            account_id=str(account_id),
            uid=email.gmail_uid,
        )
        await _save_category(db, account_id, email.gmail_uid, classification)
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

    # Phase 2: apply AI categorization after all emails are stored
    await _categorize_account_emails(db, account.id, fetched_uids)

    return await list_account_emails(db, account.id)


async def recategorize_all_emails(
    db: AsyncSession,
    account_id: uuid.UUID,
) -> list[EmailMessage]:
    categories = await _load_categories(db)
    if not categories:
        raise ValueError("No categories configured")

    result = await db.execute(
        select(EmailMessage)
        .where(EmailMessage.account_id == account_id)
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
            account_id=str(account_id),
            uid=email.gmail_uid,
            force=True,
        )
        await _save_category(db, account_id, email.gmail_uid, classification)
        await db.commit()

    return await list_account_emails(db, account_id)
