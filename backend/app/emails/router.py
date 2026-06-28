from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.accounts.models import GmailAccount
from app.auth.utils import get_current_user
from app.categories.models import Category
from app.database import get_db
from app.emails.ai_service import classify_email
from app.emails.models import EmailMessage
from app.emails.sync_service import list_account_emails, sync_account_emails

router = APIRouter()


class EmailItem(BaseModel):
    id: str
    from_address: str
    subject: str
    date: str
    body_preview: str
    body: str
    body_html: str = ""


class SyncResponse(BaseModel):
    account_id: uuid.UUID
    email_address: str
    count: int
    emails: list[EmailItem]


class CategorizeRequest(BaseModel):
    subject: str
    body: str
    sender: str = ""


class CategorizeResponse(BaseModel):
    category: dict | None


def _to_email_item(record: EmailMessage) -> EmailItem:
    return EmailItem(
        id=record.gmail_uid,
        from_address=record.from_address,
        subject=record.subject,
        date=record.date_header,
        body_preview=record.body_preview,
        body=record.body,
        body_html=record.body_html or "",
    )


async def _get_account_or_404(db: AsyncSession, account_id: uuid.UUID) -> GmailAccount:
    result = await db.execute(
        select(GmailAccount).where(GmailAccount.id == account_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account


@router.get("/sync", response_model=list[SyncResponse])
async def sync_all_accounts(
    days: int = 3,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(GmailAccount).order_by(GmailAccount.created_at))
    accounts = result.scalars().all()

    if not accounts:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Gmail accounts configured. Add one under /accounts first.",
        )

    responses = []
    for account in accounts:
        stored = await sync_account_emails(db, account, days=days)
        responses.append(
            SyncResponse(
                account_id=account.id,
                email_address=account.email_address,
                count=len(stored),
                emails=[_to_email_item(e) for e in stored],
            )
        )

    return responses


@router.get("/{account_id}", response_model=SyncResponse)
async def list_stored_account_emails(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    account = await _get_account_or_404(db, account_id)
    stored = await list_account_emails(db, account_id)

    return SyncResponse(
        account_id=account.id,
        email_address=account.email_address,
        count=len(stored),
        emails=[_to_email_item(e) for e in stored],
    )


@router.post("/{account_id}/sync", response_model=SyncResponse)
async def sync_account_emails_endpoint(
    account_id: uuid.UUID,
    days: int = 3,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    account = await _get_account_or_404(db, account_id)

    try:
        stored = await sync_account_emails(db, account, days=days)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to sync emails from Gmail: {exc}",
        ) from exc

    return SyncResponse(
        account_id=account.id,
        email_address=account.email_address,
        count=len(stored),
        emails=[_to_email_item(e) for e in stored],
    )


@router.post("/categorize", response_model=CategorizeResponse)
async def categorize_email_endpoint(
    body: CategorizeRequest,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Category).order_by(Category.created_at))
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

    matched = await classify_email(
        subject=body.subject,
        sender=body.sender,
        body_preview=body.body[:500],
        categories=category_payload,
        account_id="manual",
        uid="manual-categorize",
    )
    return CategorizeResponse(category=matched)
