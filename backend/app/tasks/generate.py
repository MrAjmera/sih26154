"""Celery task that orchestrates Feature 3: one context-analysis call, then
fanned-out format generation, hallucination guardrail, and confidence scoring
per format.

Generators run concurrently (asyncio.gather) inside a single Celery task
rather than as separate Celery subtasks/chord — simpler to operate for a
demo, and the actual bottleneck (Gemini's 10 req/min free-tier limit) caps
concurrency the same way either way. Swap to a Celery chord if you need
generators to scale across multiple workers later.
"""

import asyncio
import logging
import uuid
from datetime import datetime

from app.celery_app import celery_app
from app.db import AsyncSessionLocal
from app.models.job import Job
from app.models.submission import Submission
from app.services.context_analyzer import analyze_context
from app.services.generators import GENERATORS
from app.services.llm_service import LLMError, get_llm_provider
from app.services.outputs import create_generated_output

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.generate.generate_formats", bind=True, max_retries=0)
def generate_formats(self, job_id: str) -> None:
    asyncio.run(_generate_formats(uuid.UUID(job_id)))


async def _generate_formats(job_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as db:
        job = await db.get(Job, job_id)
        if job is None:
            logger.error("generate_formats: job %s not found", job_id)
            return

        submission = await db.get(Submission, job.submission_id)
        if submission is None:
            job.status = "failed"
            job.error = f"Submission {job.submission_id} not found"
            await db.commit()
            return

        job.status = "processing"
        await db.commit()

        llm = get_llm_provider()

        try:
            context = await analyze_context(submission.normalized_text, llm)
            job.context_analysis = context.to_dict()
            await db.commit()

            async def _run_one(format_type: str) -> tuple[str, str | Exception]:
                generator = GENERATORS.get(format_type)
                if generator is None:
                    return format_type, ValueError(f"Unknown format type: {format_type}")
                try:
                    text = await generator(submission.normalized_text, context, llm)
                    return format_type, text
                except LLMError as exc:
                    return format_type, exc

            results = await asyncio.gather(*(_run_one(fmt) for fmt in job.requested_formats))

            failures: list[str] = []
            for format_type, result in results:
                if isinstance(result, Exception):
                    logger.error("Generator '%s' failed for job %s: %s", format_type, job_id, result)
                    failures.append(f"{format_type}: {result}")
                    continue
                await create_generated_output(
                    db,
                    job_id=job.id,
                    format_type=format_type,
                    text=result,
                    source_text=submission.normalized_text,
                )

            job.status = "completed" if not failures else "completed_with_errors"
            job.error = "; ".join(failures) or None
            job.completed_at = datetime.utcnow()
            await db.commit()

        except Exception as exc:  # noqa: BLE001 - job-level failure must still be recorded
            logger.exception("generate_formats failed for job %s", job_id)
            job.status = "failed"
            job.error = str(exc)
            await db.commit()
