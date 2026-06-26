from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.accounts.models import GmailAccount
from app.accounts.service import decrypt_password
from app.auth.utils import get_current_user
from app.categories.models import Category
from app.database import get_db
from app.emails.ai_service import categorize_email
from app.emails.imap_service import fetch_recent_emails

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


class CategorizeResponse(BaseModel):
    category: dict | None


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
        password = decrypt_password(account.app_password)
        emails = fetch_recent_emails(account.email_address, password, limit=limit)
        responses.append(
            SyncResponse(
                account_id=account.id,
                email_address=account.email_address,
                count=len(emails),
                emails=[
                    EmailItem(
                        id=e["id"],
                        from_address=e["from"],
                        subject=e["subject"],
                        date=e["date"],
                        body_preview=e["body_preview"],
                    )
                    for e in emails
                ],
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

    password = decrypt_password(account.app_password)
    emails = fetch_recent_emails(account.email_address, password, limit=limit)

    return SyncResponse(
        account_id=account.id,
        email_address=account.email_address,
        count=len(emails),
        emails=[
            EmailItem(
                id=e["id"],
                from_address=e["from"],
                subject=e["subject"],
                date=e["date"],
                body_preview=e["body_preview"],
            )
            for e in emails
        ],
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

    matched = await categorize_email(body.subject, body.body, category_payload)
    return CategorizeResponse(category=matched)
