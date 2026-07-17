"""Per-account email embeddings + RAG retrieval (Neon pgvector).

Hard isolation: every query filters by user_id AND account_id.
"""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime

from sqlalchemy import bindparam, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.emails.models import EmailMessage
from app.emails.openrouter_client import OpenRouterError, openrouter

logger = logging.getLogger(__name__)

_TOP_K = 8
_BATCH = 16


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{v:.8f}" for v in values) + "]"


def email_embed_text(email: EmailMessage) -> str:
    parts = [
        f"From: {email.from_address or ''}",
        f"Subject: {email.subject or ''}",
        f"Category: {email.category_name or ''}",
        f"Priority: {email.category_priority or ''}",
        f"Preview: {email.body_preview or ''}",
    ]
    if email.has_reply and email.reply_body:
        parts.append(f"Reply: {' '.join(str(email.reply_body).split())[:200]}")
    return "\n".join(parts)


def content_hash(text_value: str) -> str:
    return hashlib.sha256(text_value.encode("utf-8")).hexdigest()


async def index_account_emails(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    emails: list[EmailMessage],
) -> int:
    """Upsert embeddings for this account only. Returns number indexed."""
    if not emails or not openrouter.configured:
        return 0

    try:
        uids = [str(e.gmail_uid) for e in emails] or ["__none__"]
        stmt = text(
            """
            DELETE FROM email_embeddings
            WHERE account_id = :account_id
              AND user_id = :user_id
              AND gmail_uid NOT IN :uids
            """
        ).bindparams(bindparam("uids", expanding=True))
        await db.execute(
            stmt,
            {"account_id": account_id, "user_id": user_id, "uids": uids},
        )

        existing = await db.execute(
            text(
                """
                SELECT gmail_uid, content_hash
                FROM email_embeddings
                WHERE account_id = :account_id AND user_id = :user_id
                """
            ),
            {"account_id": account_id, "user_id": user_id},
        )
        have = {row.gmail_uid: row.content_hash for row in existing}

        to_embed: list[tuple[EmailMessage, str, str]] = []
        for email in emails:
            payload = email_embed_text(email)
            digest = content_hash(payload)
            if have.get(str(email.gmail_uid)) == digest:
                continue
            to_embed.append((email, payload, digest))

        indexed = 0
        for i in range(0, len(to_embed), _BATCH):
            batch = to_embed[i : i + _BATCH]
            vectors = await openrouter.embed([p for _, p, _ in batch])
            now = datetime.utcnow()
            for (email, _payload, digest), vector in zip(batch, vectors):
                await db.execute(
                    text(
                        """
                        INSERT INTO email_embeddings (
                            id, user_id, account_id, email_id, gmail_uid,
                            content_hash, embedding, created_at, updated_at
                        ) VALUES (
                            :id, :user_id, :account_id, :email_id, :gmail_uid,
                            :content_hash, CAST(:embedding AS vector), :now, :now
                        )
                        ON CONFLICT (account_id, gmail_uid) DO UPDATE SET
                            email_id = EXCLUDED.email_id,
                            content_hash = EXCLUDED.content_hash,
                            embedding = EXCLUDED.embedding,
                            updated_at = EXCLUDED.updated_at
                        """
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "user_id": user_id,
                        "account_id": account_id,
                        "email_id": email.id,
                        "gmail_uid": str(email.gmail_uid),
                        "content_hash": digest,
                        "embedding": _vector_literal(vector),
                        "now": now,
                    },
                )
                indexed += 1
            await db.commit()

        return indexed
    except OpenRouterError:
        logger.warning("Skipping embedding index — OpenRouter embeddings failed")
        return 0
    except Exception:
        logger.exception("Skipping embedding index — pgvector/DB unavailable")
        try:
            await db.rollback()
        except Exception:
            pass
        return 0


async def retrieve_relevant_emails(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    question: str,
    top_k: int = _TOP_K,
) -> list[EmailMessage]:
    """Return top-k emails for this account only (never cross-account)."""
    if not question.strip() or not openrouter.configured:
        return []

    try:
        vectors = await openrouter.embed([question.strip()[:2000]])
        q = _vector_literal(vectors[0])
        result = await db.execute(
            text(
                """
                SELECT e.id AS email_id
                FROM email_embeddings ee
                JOIN emails e ON e.id = ee.email_id
                WHERE ee.user_id = :user_id
                  AND ee.account_id = :account_id
                ORDER BY ee.embedding <=> CAST(:q AS vector)
                LIMIT :k
                """
            ),
            {
                "user_id": user_id,
                "account_id": account_id,
                "q": q,
                "k": top_k,
            },
        )
        ids = [row.email_id for row in result]
        if not ids:
            return []

        emails_result = await db.execute(
            select(EmailMessage).where(
                EmailMessage.account_id == account_id,
                EmailMessage.id.in_(ids),
            )
        )
        by_id = {e.id: e for e in emails_result.scalars().all()}
        return [by_id[i] for i in ids if i in by_id]
    except Exception:
        logger.exception("RAG retrieval failed — falling back to digest only")
        return []


def format_retrieved_emails(emails: list[EmailMessage]) -> str:
    if not emails:
        return "(no retrieved emails)"
    lines: list[str] = []
    for idx, email in enumerate(emails, start=1):
        received = email.received_at.isoformat() if email.received_at else email.date_header
        status = []
        if email.has_reply or email.replied_at:
            status.append("reply_given")
        if email.is_done:
            status.append("done")
        if not status:
            status.append("needs_attention")
        preview = " ".join((email.body_preview or "").split())[:180]
        lines.append(
            f"{idx}. uid={email.gmail_uid} | {received} | from={email.from_address} | "
            f"subj={email.subject} | cat={email.category_name or '-'} | "
            f"status={','.join(status)} | {preview}"
        )
    return "\n".join(lines)
