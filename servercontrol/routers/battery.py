from fastapi import APIRouter, HTTPException

from models.hardware import BatteryLimitRequest
from services import asusctl

router = APIRouter(prefix="/battery")


@router.post("/limit", status_code=204)
async def set_battery_limit(body: BatteryLimitRequest) -> None:
    """배터리 충전 제한 설정 (20~100%)."""
    try:
        await asusctl.set_battery_limit(body.limit)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
