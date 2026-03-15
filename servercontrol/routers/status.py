from fastapi import APIRouter

from models.hardware import HardwareStatus
from services import asusctl, sysfs

router = APIRouter()


@router.get("/status", response_model=HardwareStatus)
async def get_status() -> HardwareStatus:
    """배터리·팬 프로필·온도 전체 상태 조회."""
    battery_limit, profile, battery_capacity, cpu_temp = (
        await asusctl.get_battery_limit(),
        await asusctl.get_profile(),
        sysfs.read_battery_capacity(),
        sysfs.read_cpu_temp(),
    )
    return HardwareStatus(
        battery_capacity=battery_capacity,
        battery_limit=battery_limit,
        profile=profile,
        cpu_temp=cpu_temp,
        display_brightness=sysfs.read_display_brightness_percent(),
    )
