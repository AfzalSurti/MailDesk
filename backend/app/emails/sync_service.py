from datetime import datetime
from email.utils import parsedate_to_datetime

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import GmailAccount
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


async def sync_account_emails(
    db: AsyncSession,
    account: GmailAccount,
    days: int = 3,
) -> list[EmailMessage]:
    now = datetime.utcnow()
    fetched_uids: set[str] = set()

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

    return await list_account_emails(db, account.id)
