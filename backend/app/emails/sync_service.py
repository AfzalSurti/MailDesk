import asyncio
import concurrent.futures
from datetime import datetime
from email.utils import parsedate_to_datetime
import uuid

from sqlalchemy import delete, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import GmailAccount
from app.categories.models import AccountCategoryAssignment, Category
from app.emails.ai_service import (
    CLASSIFY_BATCH_SIZE,
    ClassificationAPIError,
    classify_email,
    classify_emails_batch,
    parse_category_uuid,
)
from app.emails.imap_service import fetch_sent_replies, iter_fetch_emails
from app.emails.models import EmailMessage
from app.emails.usage import assert_categorize_rate_limit, log_ai_usage
from app.config import settings


def _next_imap_item(generator):
    """Advance a sync IMAP generator off the event loop thread."""
    try:
        return next(generator)
    except StopIteration:
        return None


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


async def get_account_email(
    db: AsyncSession,
    account_id,
    gmail_uid: str,
) -> EmailMessage | None:
    result = await db.execute(
        select(EmailMessage).where(
            EmailMessage.account_id == account_id,
            EmailMessage.gmail_uid == gmail_uid,
        )
    )
    return result.scalar_one_or_none()


# Columns needed for inbox list / stats — excludes heavy body HTML fields
_EMAIL_LIST_COLUMNS = (
    EmailMessage.id,
    EmailMessage.account_id,
    EmailMessage.gmail_uid,
    EmailMessage.subject,
    EmailMessage.from_address,
    EmailMessage.date_header,
    EmailMessage.received_at,
    EmailMessage.body_preview,
    EmailMessage.synced_at,
    EmailMessage.category_id,
    EmailMessage.category_name,
    EmailMessage.category_priority,
    EmailMessage.confidence_score,
    EmailMessage.is_done,
    EmailMessage.done_at,
    EmailMessage.replied_at,
    EmailMessage.has_reply,
    EmailMessage.reply_subject,
    EmailMessage.reply_at,
)


async def list_account_email_summaries(
    db: AsyncSession,
    account_id,
) -> list[EmailMessage]:
    """Load inbox rows without body / body_html / reply bodies (low Neon transfer)."""
    result = await db.execute(
        select(*_EMAIL_LIST_COLUMNS)
        .where(EmailMessage.account_id == account_id)
        .order_by(
            EmailMessage.received_at.desc().nullslast(),
            EmailMessage.synced_at.desc(),
        )
    )
    rows = result.all()
    emails: list[EmailMessage] = []
    for row in rows:
        email = EmailMessage(
            id=row.id,
            account_id=row.account_id,
            gmail_uid=row.gmail_uid,
            subject=row.subject or "",
            from_address=row.from_address or "",
            date_header=row.date_header or "",
            received_at=row.received_at,
            body="",
            body_html="",
            body_preview=row.body_preview or "",
            synced_at=row.synced_at,
            category_id=row.category_id,
            category_name=row.category_name,
            category_priority=row.category_priority,
            confidence_score=row.confidence_score,
            is_done=bool(row.is_done),
            done_at=row.done_at,
            replied_at=row.replied_at,
            has_reply=bool(row.has_reply),
            reply_subject=row.reply_subject,
            reply_body=None,
            reply_body_html=None,
            reply_at=row.reply_at,
        )
        emails.append(email)
    return emails


async def _upsert_email(db: AsyncSession, account_id, raw: dict, synced_at: datetime) -> bool:
    """Insert or update an email. Returns True if this UID was newly inserted."""
    existing = await db.execute(
        select(EmailMessage.id).where(
            EmailMessage.account_id == account_id,
            EmailMessage.gmail_uid == raw["uid"],
        )
    )
    is_new = existing.scalar_one_or_none() is None

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
    return is_new


async def _prune_emails_older_than(
    db: AsyncSession,
    account_id,
    cutoff: datetime,
) -> None:
    """Keep only the rolling window — do not delete merely because incremental fetch omitted them."""
    from sqlalchemy import and_, or_

    await db.execute(
        delete(EmailMessage).where(
            EmailMessage.account_id == account_id,
            or_(
                EmailMessage.received_at < cutoff,
                and_(
                    EmailMessage.received_at.is_(None),
                    EmailMessage.synced_at < cutoff,
                ),
            ),
        )
    )


async def _match_sent_replies(
    db: AsyncSession,
    account: GmailAccount,
    days: int = 3,
) -> None:
    """Match Sent Mail replies to already-synced inbox messages (same day window only)."""
    try:
        sent = await asyncio.to_thread(
            fetch_sent_replies,
            account.email_address,
            account.app_password,
            days,
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
    progress_cb=None,
    force: bool = False,
) -> dict:
    """Categorize emails in OpenRouter batches. Fetch is never rolled back on AI errors.

    Returns ``{categorized, skipped, skip_reason}``.
    """
    categories = await _load_categories(db, account)
    if not categories or not gmail_uids:
        return {"categorized": 0, "skipped": 0, "skip_reason": None}

    query = select(EmailMessage).where(
        EmailMessage.account_id == account.id,
        EmailMessage.gmail_uid.in_(gmail_uids),
    )
    if not force:
        query = query.where(
            or_(
                EmailMessage.category_name.is_(None),
                EmailMessage.category_name == "",
            )
        )
    result = await db.execute(query)
    emails_to_classify = result.scalars().all()
    total = len(emails_to_classify)
    if progress_cb:
        await progress_cb({"phase": "categorizing", "done": 0, "total": total})

    if not emails_to_classify:
        return {"categorized": 0, "skipped": 0, "skip_reason": None}

    items = [
        {
            "uid": email.gmail_uid,
            "subject": email.subject,
            "sender": email.from_address,
            "body_preview": email.body_preview,
        }
        for email in emails_to_classify
    ]

    categorized = 0
    # One sync chunk ≈ one OpenRouter batch (rules may shrink the AI set)
    for start in range(0, len(items), CLASSIFY_BATCH_SIZE):
        chunk = items[start : start + CLASSIFY_BATCH_SIZE]

        async def gate_api() -> None:
            try:
                await assert_categorize_rate_limit(db, account.user_id)
            except ValueError as exc:
                raise ClassificationAPIError(str(exc), status_code=429) from exc

        async def log_api(batch_n: int, usage: dict | None = None) -> None:
            usage = usage or {}
            emails = max(batch_n, 1)
            total = usage.get("total_tokens")
            per_email = (
                round(total / emails, 1) if isinstance(total, (int, float)) else None
            )
            await log_ai_usage(
                db,
                user_id=account.user_id,
                account_id=account.id,
                action="categorize",
                model=settings.openrouter_model_name,
                cached=False,
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                total_tokens=usage.get("total_tokens"),
                meta=f"emails={batch_n};approx_tokens_per_email={per_email}",
            )

        try:
            batch_results = await classify_emails_batch(
                chunk,
                categories,
                account_id=str(account.id),
                force=force,
                on_api_batch=gate_api,
                after_api_batch=log_api,
            )
        except ClassificationAPIError as exc:
            remaining = total - categorized
            if progress_cb:
                await progress_cb(
                    {
                        "phase": "categorize_skipped",
                        "done": categorized,
                        "total": total,
                        "skip_reason": str(exc),
                    }
                )
            return {
                "categorized": categorized,
                "skipped": remaining,
                "skip_reason": str(exc),
            }

        for email in emails_to_classify[start : start + len(chunk)]:
            classification = batch_results.get(str(email.gmail_uid))
            if not classification:
                continue
            await _save_category(db, account.id, email.gmail_uid, classification)
            categorized += 1
        await db.commit()

        if progress_cb:
            await progress_cb(
                {
                    "phase": "categorizing",
                    "done": min(categorized, total),
                    "total": total,
                }
            )

    return {"categorized": categorized, "skipped": 0, "skip_reason": None}


async def sync_account_emails(
    db: AsyncSession,
    account: GmailAccount,
    days: int = 3,
    progress_cb=None,
) -> tuple[list[EmailMessage], dict]:
    """Incremental sync when possible.

    - First sync (no last_synced_at): fetch last ``days`` days.
    - Later syncs: fetch only messages newer than last_synced_at.
    - Categorize only newly inserted emails.
    - Prune DB rows older than the rolling ``days`` window.
    """
    from datetime import timedelta

    now = datetime.utcnow()
    cutoff = now - timedelta(days=days)
    since = account.last_synced_at
    # Ignore stale watermark older than the retention window
    if since is not None and since < cutoff:
        since = None

    new_uids: set[str] = set()
    fetched_uids: set[str] = set()
    fetch_total = 0

    async def report(payload: dict) -> None:
        if progress_cb:
            await progress_cb(payload)

    # Run blocking IMAP on one worker so the event loop can serve job polls
    # and the UI can refresh the inbox while this account is still fetching.
    imap_gen = iter_fetch_emails(
        account.email_address,
        account.app_password,
        days=days,
        since=since,
    )
    loop = asyncio.get_running_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as imap_pool:
        while True:
            raw = await loop.run_in_executor(imap_pool, _next_imap_item, imap_gen)
            if raw is None:
                break

            if raw.get("_progress_only"):
                fetch_total = int(raw.get("total") or fetch_total)
                await report(
                    {
                        "phase": "fetching",
                        "done": int(raw.get("done") or 0),
                        "total": fetch_total,
                        "saved": len(fetched_uids),
                    }
                )
                continue

            uid = raw["uid"]
            fetch_total = int(raw.get("_scan_total") or fetch_total)
            fetched_uids.add(uid)
            is_new = await _upsert_email(db, account.id, raw, now)
            await db.commit()
            if is_new:
                new_uids.add(uid)
            await report(
                {
                    "phase": "fetching",
                    "done": int(raw.get("_scan_done") or len(fetched_uids)),
                    "total": fetch_total or len(fetched_uids),
                    "saved": len(fetched_uids),
                }
            )

    # Always drop mail outside the rolling 3-day window
    await report({"phase": "pruning", "done": 0, "total": 0})
    await _prune_emails_older_than(db, account.id, cutoff)
    await db.commit()

    # Reply detection for the same retention window
    await report({"phase": "matching_replies", "done": 0, "total": 0})
    await _match_sent_replies(db, account, days=days)

    # Categorize only brand-new messages — OpenRouter failures must not undo fetch
    categorize_meta = {"categorized": 0, "skipped": 0, "skip_reason": None}
    if new_uids:
        categorize_meta = await _categorize_account_emails(
            db, account, new_uids, progress_cb=progress_cb
        )

    account.last_synced_at = now
    await db.commit()
    await db.refresh(account)

    emails = await list_account_emails(db, account.id)
    from app.emails.inbox_digest import refresh_inbox_digest
    from app.emails.rag import index_account_emails

    # Digests / RAG embeddings also use OpenRouter — never fail the sync over them
    await report({"phase": "indexing", "done": 0, "total": 0})
    try:
        await refresh_inbox_digest(db, account, emails)
    except Exception:
        pass
    try:
        await index_account_emails(
            db,
            user_id=account.user_id,
            account_id=account.id,
            emails=emails,
        )
    except Exception:
        pass

    return emails, {
        "count": len(emails),
        "new_count": len(new_uids),
        "fetched_count": len(fetched_uids),
        "incremental": since is not None,
        "categorized": categorize_meta["categorized"],
        "categorize_skipped": categorize_meta["skipped"],
        "categorize_skip_reason": categorize_meta["skip_reason"],
    }


async def recategorize_all_emails(
    db: AsyncSession,
    account: GmailAccount,
    progress_cb=None,
) -> list[EmailMessage]:
    categories = await _load_categories(db, account)
    if not categories:
        raise ValueError("No categories configured")

    result = await db.execute(
        select(EmailMessage.gmail_uid).where(EmailMessage.account_id == account.id)
    )
    uids = {row[0] for row in result.all() if row[0]}
    await _categorize_account_emails(
        db,
        account,
        uids,
        progress_cb=progress_cb,
        force=True,
    )

    emails = await list_account_emails(db, account.id)
    from app.emails.inbox_digest import refresh_inbox_digest
    from app.emails.rag import index_account_emails

    try:
        await refresh_inbox_digest(db, account, emails)
    except Exception:
        pass
    try:
        await index_account_emails(
            db,
            user_id=account.user_id,
            account_id=account.id,
            emails=emails,
        )
    except Exception:
        pass
    return emails
