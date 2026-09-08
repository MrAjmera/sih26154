import uuid
from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class GeneratedOutput(Base):
    __tablename__ = "generated_outputs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id"), nullable=False, index=True)
    format_type: Mapped[str] = mapped_column(String(30), nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)  # {"text": "..."} — jsonb so structured formats fit too

    # tamper-evidence hash chain
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    previous_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    # approval workflow
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft | approved | published
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(nullable=True)

    # hallucination guardrail + confidence score (feature 1 & 2)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    grounding_pass_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    format_compliance_ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ungrounded_flags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    confidence_factors: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
