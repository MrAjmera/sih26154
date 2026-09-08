import hashlib
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generated_output import GeneratedOutput
from app.services.guardrail import check_grounding

GENESIS_HASH = hashlib.sha256(b"genesis").hexdigest()


def content_hash(content: str, previous_hash: str) -> str:
    return hashlib.sha256((content + previous_hash).encode("utf-8")).hexdigest()


async def _latest_hash_for_job(db: AsyncSession, job_id: uuid.UUID) -> str:
    result = await db.execute(
        select(GeneratedOutput.content_hash)
        .where(GeneratedOutput.job_id == job_id)
        .order_by(GeneratedOutput.created_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return row or GENESIS_HASH


async def create_generated_output(
    db: AsyncSession,
    *,
    job_id: uuid.UUID,
    format_type: str,
    text: str,
    source_text: str,
) -> GeneratedOutput:
    """Run the hallucination guardrail on newly generated text and persist the
    result, chained onto the job's tamper-evidence hash chain.
    """
    grounding = check_grounding(source_text, text)
    previous_hash = await _latest_hash_for_job(db, job_id)
    new_hash = content_hash(text, previous_hash)

    output = GeneratedOutput(
        job_id=job_id,
        format_type=format_type,
        content={"text": text},
        content_hash=new_hash,
        previous_hash=previous_hash,
        status="draft",
        grounding_pass_rate=grounding.pass_rate,
        ungrounded_flags=[{"claim": f.claim, "reason": f.reason} for f in grounding.flags],
    )
    db.add(output)
    await db.flush()
    return output
