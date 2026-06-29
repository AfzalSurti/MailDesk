from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime

from app.database import get_db
from app.auth.defaults import seed_default_categories
from app.categories.models import Category, PriorityEnum
from app.auth.models import User
from app.auth.utils import get_current_user
from app.accounts.deps import get_user_category

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str
    priority: PriorityEnum
    description: Optional[str] = None
    keywords: Optional[List[str]] = []


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    priority: PriorityEnum
    description: Optional[str]
    keywords: Optional[List[str]]
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/", response_model=list[CategoryResponse])
async def get_categories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Category)
        .where(Category.user_id == user.id)
        .order_by(Category.created_at)
    )
    categories = result.scalars().all()
    if not categories:
        await seed_default_categories(db, user.id)
        await db.commit()
        result = await db.execute(
            select(Category)
            .where(Category.user_id == user.id)
            .order_by(Category.created_at)
        )
        categories = result.scalars().all()
    return categories


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
    await db.commit()
    await db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    category = await get_user_category(db, user, category_id)
    await db.delete(category)
    await db.commit()
