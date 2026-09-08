import hashlib
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generated_output import GeneratedOutput
from app.services.guardrail import check_grounding

GENESIS_HASH = hashlib.sha256(b"genesis").hexdigest()

_ADVISORY_REQUIRED_SECTIONS = ["[HEADER]", "[SUMMARY]", "[RECOMMENDED ACTIONS]", "[TECHNICAL DETAILS]", "[CONTACTS]"]


def _check_format_compliance(format_type: str, text: str) -> bool:
    """Cheap structural check per format. Full scoring is Feature 2 (confidence
    scoring) — this only gates the boolean 'format_compliance_ok' flag.
    """
    if format_type == "advisory":
        return all(section in text for section in _ADVISORY_REQUIRED_SECTIONS)
    if format_type == "linkedin_post":
        word_count = len(text.split())
        return 0 < word_count <= 220 and "[HEADER]" not in text
    return True


def _placeholder_confidence_score(grounding_pass_rate: float, format_compliance_ok: bool) -> float:
    """Minimal stand-in until Feature 2 (confidence scoring) lands: weights
    grounding pass rate and format compliance. Not the final scoring model.
    """
    score = 0.8 * grounding_pass_rate + 0.2 * (1.0 if format_compliance_ok else 0.0)
    return round(score, 4)


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
    format_compliance_ok = _check_format_compliance(format_type, text)
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
        format_compliance_ok=format_compliance_ok,
        confidence_score=_placeholder_confidence_score(grounding.pass_rate, format_compliance_ok),
        confidence_factors=[
            f"grounding_pass_rate={grounding.pass_rate}",
            f"format_compliance_ok={format_compliance_ok}",
        ],
    )
    db.add(output)
    await db.flush()
    return output
