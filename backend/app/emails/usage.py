"""AI usage logging + simple per-user rate limits."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, Boolean, func, select
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base

# Soft limits — protect OpenRouter keys on shared plans
CHAT_LIMIT_PER_HOUR = 40
CHAT_LIMIT_PER_DAY = 200


class AIUsageLog(Base):
    __tablename__ = "ai_usage_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id = Column(
        UUID(as_uuid=True),
        ForeignKey("gmail_accounts.id", ondelete="SET NULL"),
        nullable=True,
    )
    action = Column(String(50), nullable=False)  # chat | categorize | embed
    model = Column(String(255), nullable=True)
    cached = Column(Boolean, nullable=False, default=False)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    meta = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


async def log_ai_usage(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    account_id: uuid.UUID | None,
    action: str,
    model: str | None = None,
    cached: bool = False,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    total_tokens: int | None = None,
    meta: str | None = None,
) -> None:
    db.add(
        AIUsageLog(
            user_id=user_id,
            account_id=account_id,
            action=action,
            model=model,
            cached=cached,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            meta=(meta or "")[:2000] or None,
        )
    )
    await db.commit()


async def assert_chat_rate_limit(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Raise ValueError if the user is over chat limits."""
    now = datetime.utcnow()
    hour_ago = now - timedelta(hours=1)
    day_ago = now - timedelta(days=1)

    hour_count = await db.scalar(
        select(func.count())
        .select_from(AIUsageLog)
        .where(
            AIUsageLog.user_id == user_id,
            AIUsageLog.action == "chat",
            AIUsageLog.cached.is_(False),
            AIUsageLog.created_at >= hour_ago,
        )
    )
    if (hour_count or 0) >= CHAT_LIMIT_PER_HOUR:
        raise ValueError(
            f"Chat rate limit reached ({CHAT_LIMIT_PER_HOUR}/hour). Try again later."
        )

    day_count = await db.scalar(
        select(func.count())
        .select_from(AIUsageLog)
        .where(
            AIUsageLog.user_id == user_id,
            AIUsageLog.action == "chat",
            AIUsageLog.cached.is_(False),
            AIUsageLog.created_at >= day_ago,
        )
    )
    if (day_count or 0) >= CHAT_LIMIT_PER_DAY:
        raise ValueError(
            f"Daily chat limit reached ({CHAT_LIMIT_PER_DAY}/day). Try again tomorrow."
        )
