"""Per-account answer cache for the email AI assistant.

Isolation rules (hard):
- Cache entries are always scoped by user_id + account_id
- Lookup never returns another user's or another inbox's answer
- Inbox fingerprint invalidates answers when email state changes
- Semantic matches also require same user + account + fingerprint
"""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, delete, select, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base
from app.emails.models import EmailMessage

logger = logging.getLogger(__name__)

# Cosine distance threshold for "same meaning" questions (1 - similarity)
_SEMANTIC_MAX_DISTANCE = 0.08  # ~0.92 similarity


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
    """Hash of synced email state for this account only."""
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


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{v:.8f}" for v in values) + "]"


async def get_cached_answer(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    question: str,
    fingerprint: str,
) -> ChatAnswerCache | None:
    """Exact match first, then same-account semantic match for this fingerprint."""
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
    if row:
        row.hit_count = int(row.hit_count or 0) + 1
        row.last_hit_at = datetime.utcnow()
        await db.commit()
        return row

    # Semantic fallback — still locked to this user + account + inbox state
    try:
        from app.emails.openrouter_client import openrouter

        if not openrouter.configured:
            return None
        vectors = await openrouter.embed([question.strip()[:2000]])
        qvec = _vector_literal(vectors[0])
        sem = await db.execute(
            text(
                """
                SELECT id
                FROM chat_answer_cache
                WHERE user_id = :user_id
                  AND account_id = :account_id
                  AND inbox_fingerprint = :fingerprint
                  AND question_embedding IS NOT NULL
                  AND (question_embedding <=> CAST(:q AS vector)) <= :max_dist
                ORDER BY question_embedding <=> CAST(:q AS vector)
                LIMIT 1
                """
            ),
            {
                "user_id": user_id,
                "account_id": account_id,
                "fingerprint": fingerprint,
                "q": qvec,
                "max_dist": _SEMANTIC_MAX_DISTANCE,
            },
        )
        hit = sem.first()
        if not hit:
            return None
        row = await db.get(ChatAnswerCache, hit.id)
        if not row or row.user_id != user_id or row.account_id != account_id:
            return None
        row.hit_count = int(row.hit_count or 0) + 1
        row.last_hit_at = datetime.utcnow()
        await db.commit()
        return row
    except Exception:
        logger.exception("Semantic cache lookup failed")
        return None


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
        if row.user_id != user_id:
            return
        row.answer = answer
        row.model = model
        row.question_norm = q_norm
        cache_id = row.id
    else:
        cache_id = uuid.uuid4()
        db.add(
            ChatAnswerCache(
                id=cache_id,
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

    # Best-effort question embedding for semantic reuse (same account only)
    try:
        from app.emails.openrouter_client import openrouter

        if openrouter.configured:
            vectors = await openrouter.embed([question.strip()[:2000]])
            await db.execute(
                text(
                    """
                    UPDATE chat_answer_cache
                    SET question_embedding = CAST(:embedding AS vector)
                    WHERE id = :id
                      AND user_id = :user_id
                      AND account_id = :account_id
                    """
                ),
                {
                    "embedding": _vector_literal(vectors[0]),
                    "id": cache_id,
                    "user_id": user_id,
                    "account_id": account_id,
                },
            )
            await db.commit()
    except Exception:
        logger.exception("Failed to store question embedding for semantic cache")


async def invalidate_account_cache(db: AsyncSession, account_id: uuid.UUID) -> None:
    """Drop all cached answers for an inbox after sync / status change."""
    await db.execute(
        delete(ChatAnswerCache).where(ChatAnswerCache.account_id == account_id)
    )
    await db.commit()
