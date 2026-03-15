from fastapi import APIRouter, HTTPException

from models.hardware import LedRequest
from services import asusctl

router = APIRouter()


@router.post("/led", status_code=204)
async def set_led(body: LedRequest) -> None:
    """LED 색상 설정. color=000000 이면 사실상 OFF."""
    try:
        await asusctl.set_led_static(body.color)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
