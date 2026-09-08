import uuid
from datetime import datetime

from pydantic import BaseModel


class UngroundedFlagOut(BaseModel):
    claim: str
    reason: str


class GeneratedOutputOut(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    format_type: str
    content: dict
    content_hash: str
    previous_hash: str
    status: str
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    confidence_score: float
    grounding_pass_rate: float
    format_compliance_ok: bool
    ungrounded_flags: list[UngroundedFlagOut]
    confidence_factors: list[str]
    created_at: datetime

    class Config:
        from_attributes = True


class VerifyResultOut(BaseModel):
    ok: bool
    broken_at: list[str]
