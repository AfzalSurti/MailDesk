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
from app.emails.imap_service import fetch_emails

router = APIRouter()


class EmailItem(BaseModel):
    id: str
    from_address: str
    subject: str
    date: str
    body_preview: str


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


def _to_email_items(raw_emails: list[dict]) -> list[EmailItem]:
    return [
        EmailItem(
            id=e["uid"],
            from_address=e["sender"],
            subject=e["subject"],
            date=e["date"],
            body_preview=e["body_preview"],
        )
        for e in raw_emails
    ]


@router.get("/sync", response_model=list[SyncResponse])
async def sync_all_accounts(
    limit: int = 5,
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
        emails = fetch_emails(account.email_address, account.app_password, limit=limit)
        responses.append(
            SyncResponse(
                account_id=account.id,
                email_address=account.email_address,
                count=len(emails),
                emails=_to_email_items(emails),
            )
        )

    return responses


@router.get("/{account_id}", response_model=SyncResponse)
async def fetch_account_emails(
    account_id: uuid.UUID,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(GmailAccount).where(GmailAccount.id == account_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    emails = fetch_emails(account.email_address, account.app_password, limit=limit)

    return SyncResponse(
        account_id=account.id,
        email_address=account.email_address,
        count=len(emails),
        emails=_to_email_items(emails),
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
