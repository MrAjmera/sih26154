import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.generated_output import GeneratedOutput
from app.schemas.output import GeneratedOutputOut, VerifyResultOut
from app.services.outputs import GENESIS_HASH, content_hash

router = APIRouter(prefix="/api/outputs", tags=["outputs"])


@router.get("/{job_id}", response_model=list[GeneratedOutputOut])
async def list_outputs_for_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GeneratedOutput).where(GeneratedOutput.job_id == job_id).order_by(GeneratedOutput.created_at.asc())
    )
    return result.scalars().all()


@router.post("/{output_id}/approve", response_model=GeneratedOutputOut)
async def approve_output(output_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    output = await db.get(GeneratedOutput, output_id)
    if not output:
        raise HTTPException(status_code=404, detail="Output not found")
    if output.status != "draft":
        raise HTTPException(status_code=400, detail=f"Cannot approve output in status '{output.status}'")
    output.status = "approved"
    await db.flush()
    await db.refresh(output)
    return output


@router.get("/{output_id}/verify", response_model=VerifyResultOut)
async def verify_output_chain(output_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Recompute the hash chain for the output's job and confirm nothing was altered."""
    output = await db.get(GeneratedOutput, output_id)
    if not output:
        raise HTTPException(status_code=404, detail="Output not found")

    result = await db.execute(
        select(GeneratedOutput)
        .where(GeneratedOutput.job_id == output.job_id)
        .order_by(GeneratedOutput.created_at.asc())
    )
    outputs = result.scalars().all()

    previous_hash = GENESIS_HASH
    broken_at: list[str] = []
    for row in outputs:
        recomputed = content_hash(row.content.get("text", ""), previous_hash)
        if recomputed != row.content_hash or row.previous_hash != previous_hash:
            broken_at.append(row.format_type)
        previous_hash = row.content_hash

    return VerifyResultOut(ok=len(broken_at) == 0, broken_at=broken_at)
