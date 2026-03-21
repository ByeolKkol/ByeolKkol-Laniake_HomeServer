from pydantic import BaseModel, Field


class CookieUpdate(BaseModel):
    nid_aut: str = Field(min_length=1)
    nid_ses: str = Field(min_length=1)
