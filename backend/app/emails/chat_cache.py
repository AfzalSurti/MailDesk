"""Per-account exact answer cache for the email AI assistant.

Isolation rules (hard):
- Cache entries are always scoped by user_id + account_id
- Lookup never returns another user's or another inbox's answer
- Inbox fingerprint invalidates answers when email state changes
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, delete, select
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base
from app.emails.models import EmailMessage


class ChatAnswerCache(Base):
    __tablename__ = "chat_answer_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id = Column(
        UUID(as_uuid=True),
        ForeignKey("gmail_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    question_hash = Column(String(64), nullable=False)
    question_norm = Column(Text, nullable=False)
    inbox_fingerprint = Column(String(64), nullable=False)
    answer = Column(Text, nullable=False)
    model = Column(String(255), nullable=True)
    hit_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_hit_at = Column(DateTime, nullable=True)


def normalize_question(question: str) -> str:
    return " ".join((question or "").lower().split())


def question_hash(question: str) -> str:
    return hashlib.sha256(normalize_question(question).encode("utf-8")).hexdigest()


def inbox_fingerprint(emails: list[EmailMessage]) -> str:
    """Hash of synced email state for this account only.

    Any sync / done / reply / category change → new fingerprint → cache miss.
    """
    parts: list[str] = []
    for email in emails:
        parts.append(
            "|".join(
                [
                    str(email.gmail_uid or ""),
                    str(int(bool(email.is_done))),
                    str(int(bool(email.has_reply or email.replied_at))),
                    (email.category_name or ""),
                    (email.subject or "")[:200],
                    (email.body_preview or "")[:120],
                    email.synced_at.isoformat() if email.synced_at else "",
                ]
            )
        )
    blob = "\n".join(parts)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


async def get_cached_answer(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    question: str,
    fingerprint: str,
) -> ChatAnswerCache | None:
    """Return cached answer only if user + account + question + fingerprint match."""
    q_hash = question_hash(question)
    result = await db.execute(
        select(ChatAnswerCache).where(
            ChatAnswerCache.user_id == user_id,
            ChatAnswerCache.account_id == account_id,
            ChatAnswerCache.question_hash == q_hash,
            ChatAnswerCache.inbox_fingerprint == fingerprint,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        return None

    row.hit_count = int(row.hit_count or 0) + 1
    row.last_hit_at = datetime.utcnow()
    await db.commit()
    return row


async def store_cached_answer(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    question: str,
    fingerprint: str,
    answer: str,
    model: str | None,
) -> None:
    q_norm = normalize_question(question)
    q_hash = question_hash(question)

    existing = await db.execute(
        select(ChatAnswerCache).where(
            ChatAnswerCache.account_id == account_id,
            ChatAnswerCache.question_hash == q_hash,
            ChatAnswerCache.inbox_fingerprint == fingerprint,
        )
    )
    row = existing.scalar_one_or_none()
    if row:
        # Never overwrite another user's row if somehow present
        if row.user_id != user_id:
            return
        row.answer = answer
        row.model = model
        row.question_norm = q_norm
    else:
        db.add(
            ChatAnswerCache(
                user_id=user_id,
                account_id=account_id,
                question_hash=q_hash,
                question_norm=q_norm,
                inbox_fingerprint=fingerprint,
                answer=answer,
                model=model,
            )
        )
    await db.commit()


async def invalidate_account_cache(db: AsyncSession, account_id: uuid.UUID) -> None:
    """Drop all cached answers for an inbox after sync / status change."""
    await db.execute(
        delete(ChatAnswerCache).where(ChatAnswerCache.account_id == account_id)
    )
    await db.commit()
