import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SubmissionCreate(BaseModel):
    normalized_text: str = Field(min_length=1)
    source_type: str = "text"


class SubmissionOut(BaseModel):
    id: uuid.UUID
    source_type: str
    normalized_text: str
    sensitivity_flag: str
    created_at: datetime

    class Config:
        from_attributes = True


class GenerateRequest(BaseModel):
    formats: list[str] = Field(min_length=1)


class GenerateResponse(BaseModel):
    job_id: uuid.UUID
    status: str
