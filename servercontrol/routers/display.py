from fastapi import APIRouter, HTTPException

from models.hardware import DisplayBrightnessRequest
from services import sysfs

router = APIRouter(prefix="/display")


@router.post("/brightness", status_code=204)
def set_brightness(body: DisplayBrightnessRequest) -> None:
    """화면 밝기 설정 (0~100%). 백라이트 수치만 변경."""
    try:
        sysfs.write_display_brightness_percent(body.brightness)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/off", status_code=204)
def turn_off_display() -> None:
    """화면 완전 끄기 — TTY DPMS 블랭크 + 백라이트 0."""
    errors: list[str] = []
    try:
        sysfs.blank_display()
    except RuntimeError as e:
        errors.append(f"TTY blank: {e}")
    try:
        sysfs.write_display_brightness_percent(0)
    except RuntimeError as e:
        errors.append(f"backlight: {e}")
    if len(errors) == 2:
        raise HTTPException(status_code=500, detail=" / ".join(errors))


@router.post("/on", status_code=204)
def turn_on_display() -> None:
    """화면 켜기 — TTY 블랭크 해제 + 백라이트 50% 복원."""
    errors: list[str] = []
    try:
        sysfs.unblank_display()
    except RuntimeError as e:
        errors.append(f"TTY unblank: {e}")
    try:
        sysfs.write_display_brightness_percent(50)
    except RuntimeError as e:
        errors.append(f"backlight: {e}")
    if len(errors) == 2:
        raise HTTPException(status_code=500, detail=" / ".join(errors))
