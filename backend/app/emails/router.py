from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.accounts.deps import get_user_gmail_account
from app.accounts.models import GmailAccount
from app.auth.models import User
from app.auth.utils import get_current_user
from app.categories.models import Category
from app.database import get_db
from app.emails.ai_service import ClassificationAPIError, classify_email
from app.emails.chat_cache import invalidate_account_cache
from app.emails.chat_service import answer_email_question
from app.emails.inbox_digest import refresh_inbox_digest
from app.emails.models import EmailMessage
from app.emails.openrouter_client import OpenRouterError
from app.emails.sync_service import (
    categorize_stored_email,
    compute_inbox_stats,
    list_account_emails,
)
from app.jobs.service import create_job, execute_job

router = APIRouter()


class InboxStats(BaseModel):
    total: int = 0
    replied: int = 0
    unreplied: int = 0
    done: int = 0


class EmailItem(BaseModel):
    id: str
    from_address: str
    subject: str
    date: str
    body_preview: str
    body: str
    body_html: str = ""
    category_name: str | None = None
    category_priority: str | None = None
    confidence_score: float | None = None
    is_done: bool = False
    done_at: str | None = None
    replied_at: str | None = None
    has_reply: bool = False
    reply_subject: str | None = None
    reply_body: str | None = None
    reply_body_html: str | None = None
    reply_at: str | None = None


class SyncResponse(BaseModel):
    account_id: uuid.UUID
    email_address: str
    count: int
    stats: InboxStats
    emails: list[EmailItem]


class CategorizeRequest(BaseModel):
    subject: str
    body: str
    sender: str = ""


class CategorizeResponse(BaseModel):
    category: dict | None


class EmailStatusRequest(BaseModel):
    is_done: bool


class EmailReplyDoneRequest(BaseModel):
    mark_done: bool = True


class ChatHistoryItem(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatHistoryItem] = []


class ChatResponse(BaseModel):
    reply: str
    model: str
    emails_used: int
    cached: bool = False


class JobEnqueueResponse(BaseModel):
    job_id: uuid.UUID
    status: str
    job_type: str
    message: str


def _to_email_item(record: EmailMessage) -> EmailItem:
    return EmailItem(
        id=record.gmail_uid,
        from_address=record.from_address,
        subject=record.subject,
        date=record.date_header,
        body_preview=record.body_preview,
        body=record.body,
        body_html=record.body_html or "",
        category_name=record.category_name,
        category_priority=record.category_priority,
        confidence_score=record.confidence_score,
        is_done=bool(record.is_done),
        done_at=record.done_at.isoformat() if record.done_at else None,
        replied_at=record.replied_at.isoformat() if record.replied_at else None,
        has_reply=bool(record.has_reply),
        reply_subject=record.reply_subject,
        reply_body=record.reply_body,
        reply_body_html=record.reply_body_html,
        reply_at=record.reply_at.isoformat() if record.reply_at else None,
    )


def _sync_response(account: GmailAccount, stored: list[EmailMessage]) -> SyncResponse:
    stats = compute_inbox_stats(stored)
    return SyncResponse(
        account_id=account.id,
        email_address=account.email_address,
        count=len(stored),
        stats=InboxStats(**stats),
        emails=[_to_email_item(e) for e in stored],
    )


async def _get_account_or_404(
    db: AsyncSession,
    user: User,
    account_id: uuid.UUID,
) -> GmailAccount:
    return await get_user_gmail_account(db, user, account_id)


@router.get("/sync", response_model=list[SyncResponse])
async def sync_all_accounts(
    days: int = 3,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(GmailAccount)
        .where(GmailAccount.user_id == user.id)
        .order_by(GmailAccount.created_at)
    )
    accounts = result.scalars().all()

    if not accounts:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Gmail accounts configured. Add one under /accounts first.",
        )

    responses = []
    for account in accounts:
        stored = await sync_account_emails(db, account, days=days)
        responses.append(_sync_response(account, stored))

    return responses


@router.get("/{account_id}", response_model=SyncResponse)
async def list_stored_account_emails(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await _get_account_or_404(db, user, account_id)
    stored = await list_account_emails(db, account_id)
    return _sync_response(account, stored)


@router.post("/{account_id}/sync", response_model=JobEnqueueResponse)
async def sync_account_emails_endpoint(
    account_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    days: int = 3,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await _get_account_or_404(db, user, account_id)
    _ = days  # reserved; worker uses the standard 3-day window
    job = await create_job(
        db,
        user_id=user.id,
        account_id=account.id,
        job_type="sync",
    )
    background_tasks.add_task(execute_job, job.id)
    return JobEnqueueResponse(
        job_id=job.id,
        status=job.status,
        job_type=job.job_type,
        message="Sync queued",
    )


@router.post("/{account_id}/chat", response_model=ChatResponse)
async def chat_about_emails(
    account_id: uuid.UUID,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await _get_account_or_404(db, user, account_id)
    message = (body.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")
    if len(message) > 2000:
        raise HTTPException(status_code=400, detail="Message is too long")

    try:
        from app.config import settings

        reply, cached = await answer_email_question(
            db,
            user_id=user.id,
            account_id=account.id,
            account_email=account.email_address,
            question=message,
            history=[item.model_dump() for item in body.history],
            account=account,
        )
        stored = await list_account_emails(db, account.id)
        return ChatResponse(
            reply=reply,
            model=settings.openrouter_model_name,
            emails_used=min(len(stored), 40),
            cached=cached,
        )
    except OpenRouterError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED
            if exc.status_code in (401, 402, 403)
            else status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.post("/{account_id}/recategorize", response_model=JobEnqueueResponse)
async def recategorize_all_emails_endpoint(
    account_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await _get_account_or_404(db, user, account_id)
    job = await create_job(
        db,
        user_id=user.id,
        account_id=account.id,
        job_type="recategorize",
    )
    background_tasks.add_task(execute_job, job.id)
    return JobEnqueueResponse(
        job_id=job.id,
        status=job.status,
        job_type=job.job_type,
        message="Re-categorize queued",
    )


@router.post("/{account_id}/{gmail_uid}/categorize", response_model=CategorizeResponse)
async def categorize_stored_email_endpoint(
    account_id: uuid.UUID,
    gmail_uid: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_account_or_404(db, user, account_id)
    try:
        account = await _get_account_or_404(db, user, account_id)
        matched = await categorize_stored_email(db, account, account_id, gmail_uid)
        await invalidate_account_cache(db, account.id)
        stored = await list_account_emails(db, account.id)
        await refresh_inbox_digest(db, account, stored)
    except ClassificationAPIError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED
            if exc.status_code in (401, 402, 403)
            else status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI categorization failed: {exc}",
        ) from exc
    return CategorizeResponse(category=matched)


@router.patch("/{account_id}/{gmail_uid}/status", response_model=SyncResponse)
async def update_email_status_endpoint(
    account_id: uuid.UUID,
    gmail_uid: str,
    body: EmailStatusRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await _get_account_or_404(db, user, account_id)
    result = await db.execute(
        select(EmailMessage).where(
            EmailMessage.account_id == account_id,
            EmailMessage.gmail_uid == gmail_uid,
        )
    )
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email not found")

    from datetime import datetime

    email.is_done = body.is_done
    email.done_at = datetime.utcnow() if body.is_done else None
    if not body.is_done:
        email.replied_at = None
    await db.commit()
    await invalidate_account_cache(db, account.id)
    stored = await list_account_emails(db, account.id)
    await refresh_inbox_digest(db, account, stored)
    return _sync_response(account, stored)


@router.post("/{account_id}/{gmail_uid}/reply-done", response_model=SyncResponse)
async def mark_replied_done_endpoint(
    account_id: uuid.UUID,
    gmail_uid: str,
    body: EmailReplyDoneRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await _get_account_or_404(db, user, account_id)
    result = await db.execute(
        select(EmailMessage).where(
            EmailMessage.account_id == account_id,
            EmailMessage.gmail_uid == gmail_uid,
        )
    )
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email not found")

    from datetime import datetime

    now = datetime.utcnow()
    email.replied_at = now
    email.has_reply = True
    if body.mark_done:
        email.is_done = True
        email.done_at = now
    await db.commit()
    await invalidate_account_cache(db, account.id)
    stored = await list_account_emails(db, account.id)
    await refresh_inbox_digest(db, account, stored)
    return _sync_response(account, stored)


@router.post("/categorize", response_model=CategorizeResponse)
async def categorize_email_endpoint(
    body: CategorizeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Category)
        .where(Category.user_id == user.id)
        .order_by(Category.created_at)
    )
    categories = result.scalars().all()

    category_payload = [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "priority": c.priority.value,
            "keywords": c.keywords or [],
        }
        for c in categories
    ]

    if not category_payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No categories configured. Add categories first.",
        )

    try:
        matched = await classify_email(
            subject=body.subject,
            sender=body.sender,
            body_preview=body.body[:500],
            categories=category_payload,
            account_id="manual",
            uid="manual-categorize",
            force=True,
        )
    except ClassificationAPIError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED
            if exc.status_code in (401, 402, 403)
            else status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return CategorizeResponse(category=matched)
