"""Postgres-backed background jobs for sync and bulk categorize."""

from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, select
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, Base


class BackgroundJob(Base):
    __tablename__ = "background_jobs"

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
    job_type = Column(String(50), nullable=False)  # sync | recategorize
    status = Column(String(20), nullable=False, default="queued")  # queued|running|completed|failed
    error = Column(Text, nullable=True)
    result_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)


async def create_job(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    job_type: str,
) -> BackgroundJob:
    job = BackgroundJob(
        user_id=user_id,
        account_id=account_id,
        job_type=job_type,
        status="queued",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def get_user_job(
    db: AsyncSession,
    *,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
) -> BackgroundJob | None:
    result = await db.execute(
        select(BackgroundJob).where(
            BackgroundJob.id == job_id,
            BackgroundJob.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def execute_job(job_id: uuid.UUID) -> None:
    """Run in a fresh DB session (safe for FastAPI BackgroundTasks)."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(BackgroundJob).where(BackgroundJob.id == job_id)
        )
        job = result.scalar_one_or_none()
        if not job or job.status not in ("queued", "running"):
            return

        job.status = "running"
        job.started_at = datetime.utcnow()
        await db.commit()

        try:
            from app.accounts.models import GmailAccount
            from app.emails.chat_cache import invalidate_account_cache
            from app.emails.sync_service import (
                recategorize_all_emails,
                sync_account_emails,
            )

            account_result = await db.execute(
                select(GmailAccount).where(GmailAccount.id == job.account_id)
            )
            account = account_result.scalar_one_or_none()
            if not account or account.user_id != job.user_id:
                raise ValueError("Account not found for this job")

            if job.job_type == "sync":
                emails = await sync_account_emails(db, account, days=3)
            elif job.job_type == "recategorize":
                emails = await recategorize_all_emails(db, account)
            else:
                raise ValueError(f"Unknown job type: {job.job_type}")

            await invalidate_account_cache(db, account.id)

            # Re-load job in case session state drifted
            job_result = await db.execute(
                select(BackgroundJob).where(BackgroundJob.id == job_id)
            )
            job = job_result.scalar_one()
            job.status = "completed"
            job.finished_at = datetime.utcnow()
            job.result_json = json.dumps(
                {
                    "count": len(emails),
                    "account_id": str(account.id),
                }
            )
            await db.commit()
        except Exception as exc:
            job_result = await db.execute(
                select(BackgroundJob).where(BackgroundJob.id == job_id)
            )
            job = job_result.scalar_one_or_none()
            if job:
                job.status = "failed"
                job.finished_at = datetime.utcnow()
                job.error = str(exc)[:2000]
                await db.commit()
