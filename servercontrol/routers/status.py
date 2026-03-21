from fastapi import APIRouter

from models.hardware import HardwareStatus
from services import asusctl, sysfs

router = APIRouter()


@router.get("/status", response_model=HardwareStatus)
async def get_status() -> HardwareStatus:
    """배터리·팬 프로필·온도 전체 상태 조회."""
    import asyncio
    battery_limit, profile = await asyncio.gather(
        asusctl.get_battery_limit(),
        asusctl.get_profile(),
    )
    return HardwareStatus(
        battery_capacity=sysfs.read_battery_capacity(),
        battery_limit=battery_limit,
        profile=profile,
        cpu_temp=sysfs.read_cpu_temp(),
        display_brightness=sysfs.read_display_brightness_percent(),
    )
