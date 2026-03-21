from pydantic import BaseModel, Field


class ChannelCreate(BaseModel):
    channel_id: str = Field(min_length=3, max_length=64)
    name: str | None = None
    quality: str = "best"
    is_active: bool = True


class ChannelUpdate(BaseModel):
    name: str | None = None
    quality: str | None = None
    is_active: bool | None = None
