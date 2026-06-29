import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import GmailAccount
from app.auth.models import User
from app.categories.models import Category


async def get_user_gmail_account(
    db: AsyncSession,
    user: User,
    account_id: uuid.UUID,
) -> GmailAccount:
    result = await db.execute(
        select(GmailAccount).where(
            GmailAccount.id == account_id,
            GmailAccount.user_id == user.id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account


async def get_user_category(
    db: AsyncSession,
    user: User,
    category_id: uuid.UUID,
) -> Category:
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.user_id == user.id,
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category
