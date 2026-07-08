"""Default AI categories seeded for each new user workspace."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.categories.models import AccountCategoryAssignment, Category, PriorityEnum

DEFAULT_CATEGORIES = [
    (
        "Job Opportunities",
        PriorityEnum.high,
        "Job alerts, internships, career tips, recruitment and hiring emails. NOT security codes or 2FA emails.",
        ["job alert", "career", "intern", "hiring", "vacancy", "resume", "recruiter", "interview", "apply now"],
    ),
    (
        "Finance & Billing",
        PriorityEnum.high,
        "Invoices, payments, receipts, billing statements and financial notices",
        ["invoice", "payment", "billing", "receipt", "due", "subscription", "charge"],
    ),
    (
        "Security & Authentication",
        PriorityEnum.high,
        "Verification codes, 2-step/2FA, login alerts, password resets, account security from Google, Microsoft, etc.",
        ["verification", "2-step", "two-step", "2fa", "security alert", "sign-in", "login", "authentication", "verify"],
    ),
    (
        "Marketing & Newsletters",
        PriorityEnum.low,
        "Promotional offers, newsletters, ads and marketing campaigns",
        ["newsletter", "promotion", "offer", "sale", "discount", "unsubscribe", "marketing"],
    ),
    (
        "General Updates",
        PriorityEnum.medium,
        "General notifications, account updates and informational emails that do not fit other categories",
        ["update", "notification", "reminder", "confirm", "welcome", "info"],
    ),
]


async def seed_default_categories(db: AsyncSession, user_id) -> None:
    for name, priority, description, keywords in DEFAULT_CATEGORIES:
        db.add(
            Category(
                user_id=user_id,
                name=name,
                priority=priority,
                description=description,
                keywords=keywords,
            )
        )
    await db.flush()


async def assign_categories_to_account(db: AsyncSession, account_id, category_ids) -> None:
    for category_id in category_ids:
        db.add(
            AccountCategoryAssignment(
                account_id=account_id,
                category_id=category_id,
            )
        )
    await db.flush()


async def assign_all_user_categories_to_account(db: AsyncSession, user_id, account_id) -> None:
    categories = await db.execute(select(Category.id).where(Category.user_id == user_id))
    category_ids = list(categories.scalars().all())
    await assign_categories_to_account(db, account_id, category_ids)
