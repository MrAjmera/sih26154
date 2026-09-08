import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery_app
from app.db import get_db
from app.models.job import Job
from app.models.submission import Submission
from app.models.user import User
from app.schemas.submission import GenerateRequest, GenerateResponse, SubmissionCreate, SubmissionOut
from app.services.generators import GENERATORS

router = APIRouter(prefix="/api/submissions", tags=["submissions"])

_DEV_USER_EMAIL = "dev@onesource.local"


async def _get_or_create_dev_user(db: AsyncSession) -> User:
    """No auth is wired up yet — every submission is attributed to a single
    dev user so the pipeline is testable end-to-end. Replace with the real
    authenticated user once auth lands.
    """
    result = await db.execute(select(User).where(User.email == _DEV_USER_EMAIL))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(email=_DEV_USER_EMAIL, password_hash="", role="operator")
        db.add(user)
        await db.flush()
    return user


@router.post("", response_model=SubmissionOut)
async def create_submission(body: SubmissionCreate, db: AsyncSession = Depends(get_db)):
    user = await _get_or_create_dev_user(db)
    submission = Submission(
        user_id=user.id,
        source_type=body.source_type,
        normalized_text=body.normalized_text,
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return submission


@router.post("/{submission_id}/generate", response_model=GenerateResponse)
async def generate(submission_id: uuid.UUID, body: GenerateRequest, db: AsyncSession = Depends(get_db)):
    submission = await db.get(Submission, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")

    unknown = [f for f in body.formats if f not in GENERATORS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown format(s): {unknown}. Supported: {list(GENERATORS)}")

    job = Job(submission_id=submission.id, status="queued", requested_formats=body.formats)
    db.add(job)
    await db.commit()
    await db.refresh(job)

    celery_app.send_task("app.tasks.generate.generate_formats", args=[str(job.id)])

    return GenerateResponse(job_id=job.id, status=job.status)


@router.get("/{submission_id}/jobs/{job_id}", response_model=GenerateResponse)
async def get_job_status(submission_id: uuid.UUID, job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if job is None or job.submission_id != submission_id:
        raise HTTPException(status_code=404, detail="Job not found")
    return GenerateResponse(job_id=job.id, status=job.status)
