from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
import json

from app.auth.models import User
from app.auth.utils import get_current_user
from app.database import get_db
from app.jobs.service import get_user_job

router = APIRouter()


class JobResponse(BaseModel):
    id: uuid.UUID
    job_type: str
    status: str
    error: str | None = None
    result: dict | None = None
    created_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = await get_user_job(db, job_id=job_id, user_id=user.id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    result = None
    if job.result_json:
        try:
            result = json.loads(job.result_json)
        except json.JSONDecodeError:
            result = None

    return JobResponse(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        error=job.error,
        result=result,
        created_at=job.created_at.isoformat() if job.created_at else None,
        started_at=job.started_at.isoformat() if job.started_at else None,
        finished_at=job.finished_at.isoformat() if job.finished_at else None,
    )
