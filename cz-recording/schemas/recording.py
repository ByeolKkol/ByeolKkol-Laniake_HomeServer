from pydantic import BaseModel


class RecordingStartRequest(BaseModel):
    channel_id: str | None = None


class RecordingUpdate(BaseModel):
    status: str | None = None
    title: str | None = None
