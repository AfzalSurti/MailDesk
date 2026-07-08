from datetime import datetime
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.deps import get_user_category, get_user_gmail_account
from app.accounts.models import GmailAccount
from app.auth.defaults import (
    assign_all_user_categories_to_account,
    assign_categories_to_account,
    seed_default_categories,
)
from app.auth.models import User
from app.auth.utils import get_current_user
from app.categories.models import AccountCategoryAssignment, Category, PriorityEnum
from app.database import get_db

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str
    priority: PriorityEnum
    description: Optional[str] = None
    keywords: Optional[List[str]] = []
    account_ids: Optional[List[uuid.UUID]] = None


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    priority: PriorityEnum
    description: Optional[str]
    keywords: Optional[List[str]]
    created_at: datetime
    assigned: bool = False
    assigned_account_ids: List[uuid.UUID] = []

    class Config:
        from_attributes = True


class CategoryAssignmentUpdate(BaseModel):
    account_ids: List[uuid.UUID]


async def _list_user_categories(db: AsyncSession, user: User) -> list[Category]:
    result = await db.execute(
        select(Category)
        .where(Category.user_id == user.id)
        .order_by(Category.created_at)
    )
    categories = result.scalars().all()
    if not categories:
        await seed_default_categories(db, user.id)
        accounts = await db.execute(select(GmailAccount.id).where(GmailAccount.user_id == user.id))
        for account_id in accounts.scalars().all():
            await assign_all_user_categories_to_account(db, user.id, account_id)
        await db.commit()
        result = await db.execute(
            select(Category)
            .where(Category.user_id == user.id)
            .order_by(Category.created_at)
        )
        categories = result.scalars().all()
    return list(categories)


async def _assigned_category_ids_by_account(
    db: AsyncSession,
    account_id: uuid.UUID,
) -> set[uuid.UUID]:
    result = await db.execute(
        select(AccountCategoryAssignment.category_id).where(
            AccountCategoryAssignment.account_id == account_id
        )
    )
    return set(result.scalars().all())


async def _assigned_account_ids_by_category(
    db: AsyncSession,
    category_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[uuid.UUID]]:
    if not category_ids:
        return {}

    result = await db.execute(
        select(
            AccountCategoryAssignment.category_id,
            AccountCategoryAssignment.account_id,
        ).where(AccountCategoryAssignment.category_id.in_(category_ids))
    )

    mapping: dict[uuid.UUID, list[uuid.UUID]] = {category_id: [] for category_id in category_ids}
    for category_id, account_id in result.all():
        mapping.setdefault(category_id, []).append(account_id)
    return mapping


@router.get("/", response_model=list[CategoryResponse])
async def get_categories(
    account_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if account_id:
        await get_user_gmail_account(db, user, account_id)
    categories = await _list_user_categories(db, user)
    category_ids = [category.id for category in categories]
    assignments = await _assigned_account_ids_by_category(db, category_ids)
    selected_assignments = (
        await _assigned_category_ids_by_account(db, account_id) if account_id else set()
    )

    return [
        CategoryResponse(
            id=category.id,
            name=category.name,
            priority=category.priority,
            description=category.description,
            keywords=category.keywords,
            created_at=category.created_at,
            assigned=category.id in selected_assignments if account_id else False,
            assigned_account_ids=assignments.get(category.id, []),
        )
        for category in categories
    ]


@router.post("/", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Category).where(
            Category.user_id == user.id,
            Category.name == body.name,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Category with this name already exists")

    category = Category(
        user_id=user.id,
        name=body.name,
        priority=body.priority,
        description=body.description,
        keywords=body.keywords,
    )
    db.add(category)
    await db.flush()

    account_ids = body.account_ids or []
    if account_ids:
        for account_id in account_ids:
            await get_user_gmail_account(db, user, account_id)
            await assign_categories_to_account(db, account_id, [category.id])
    await db.commit()
    await db.refresh(category)
    return CategoryResponse(
        id=category.id,
        name=category.name,
        priority=category.priority,
        description=category.description,
        keywords=category.keywords,
        created_at=category.created_at,
        assigned=False,
        assigned_account_ids=body.account_ids or [],
    )


@router.put("/{category_id}/accounts", response_model=CategoryResponse)
async def update_category_accounts(
    category_id: uuid.UUID,
    body: CategoryAssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    category = await get_user_category(db, user, category_id)
    for account_id in body.account_ids:
        await get_user_gmail_account(db, user, account_id)

    await db.execute(
        delete(AccountCategoryAssignment).where(
            AccountCategoryAssignment.category_id == category.id
        )
    )
    await db.flush()
    for account_id in body.account_ids:
        db.add(
            AccountCategoryAssignment(
                account_id=account_id,
                category_id=category.id,
            )
        )

    await db.commit()
    await db.refresh(category)
    return CategoryResponse(
        id=category.id,
        name=category.name,
        priority=category.priority,
        description=category.description,
        keywords=category.keywords,
        created_at=category.created_at,
        assigned=False,
        assigned_account_ids=body.account_ids,
    )


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    category = await get_user_category(db, user, category_id)
    await db.delete(category)
    await db.commit()
