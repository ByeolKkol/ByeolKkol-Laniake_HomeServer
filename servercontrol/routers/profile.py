from fastapi import APIRouter, HTTPException

from models.hardware import ProfileRequest
from services import asusctl

router = APIRouter()


@router.post("/profile", status_code=204)
async def set_profile(body: ProfileRequest) -> None:
    """팬 프로필 변경 (Quiet / Balanced / Performance)."""
    try:
        await asusctl.set_profile(body.profile)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
