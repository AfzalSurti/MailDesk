from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid

from app.database import get_db
from app.accounts.models import GmailAccount
from app.accounts.service import encrypt_password, decrypt_password, test_imap_connection
from app.auth.utils import get_current_user

router = APIRouter()

# ---------- Schemas ----------

class AccountCreate(BaseModel):
    email_address: EmailStr
    app_password: str
    display_name: Optional[str] = None

class AccountUpdate(BaseModel):
    display_name: Optional[str] = None
    app_password: Optional[str] = None

class AccountResponse(BaseModel):
    id: uuid.UUID
    email_address: str
    display_name: Optional[str]

    class Config:
        from_attributes = True

# ---------- Routes ----------

@router.get("/", response_model=list[AccountResponse])
async def get_accounts(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user)
):
    result = await db.execute(select(GmailAccount).order_by(GmailAccount.created_at))
    accounts = result.scalars().all()
    return accounts


@router.post("/", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def add_account(
    body: AccountCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user)
):
    # Check duplicate
    result = await db.execute(
        select(GmailAccount).where(GmailAccount.email_address == body.email_address)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Account already exists")

    # Test IMAP before saving
    valid = test_imap_connection(body.email_address, body.app_password)
    if not valid:
        raise HTTPException(
            status_code=400,
            detail="Could not connect to Gmail. Check email and app password."
        )

    account = GmailAccount(
        email_address=body.email_address,
        app_password=encrypt_password(body.app_password),
        display_name=body.display_name
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user)
):
    result = await db.execute(
        select(GmailAccount).where(GmailAccount.id == account_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    await db.delete(account)
    await db.commit()


@router.patch("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: uuid.UUID,
    body: AccountUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(GmailAccount).where(GmailAccount.id == account_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if body.display_name is not None:
        account.display_name = body.display_name.strip() or None

    if body.app_password is not None:
        if not body.app_password.strip():
            raise HTTPException(status_code=400, detail="App password cannot be empty")
        valid = test_imap_connection(account.email_address, body.app_password)
        if not valid:
            raise HTTPException(
                status_code=400,
                detail="Could not connect to Gmail. Check the app password.",
            )
        account.app_password = encrypt_password(body.app_password)

    if body.display_name is None and body.app_password is None:
        raise HTTPException(status_code=400, detail="Nothing to update")

    await db.commit()
    await db.refresh(account)
    return account