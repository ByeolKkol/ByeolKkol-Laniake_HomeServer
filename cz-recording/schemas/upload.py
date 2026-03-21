from pydantic import BaseModel, Field


class UploadCreate(BaseModel):
    recording_id: int
    destination: str = Field(min_length=1, max_length=128)
    status: str = "queued"
    message: str | None = None
