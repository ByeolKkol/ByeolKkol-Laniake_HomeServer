import glob
from pathlib import Path

_BACKLIGHT_DIR = Path("/sys/class/backlight/amdgpu_bl1")

# FB_BLANK_UNBLANK=0, FB_BLANK_POWERDOWN=4 (kernel framebuffer power constants)
_BL_POWER_ON = "0"
_BL_POWER_OFF = "4"


def blank_display() -> None:
    """화면 완전 끄기 — bl_power=4 (FB_BLANK_POWERDOWN)."""
    try:
        _backlight_path("bl_power").write_text(_BL_POWER_OFF)
    except PermissionError as e:
        raise RuntimeError("bl_power 쓰기 권한 없음 (컨테이너 privileged 필요)") from e
    except Exception as e:
        raise RuntimeError(f"bl_power 쓰기 실패: {e}") from e


def unblank_display() -> None:
    """화면 켜기 — bl_power=0 (FB_BLANK_UNBLANK)."""
    try:
        _backlight_path("bl_power").write_text(_BL_POWER_ON)
    except PermissionError as e:
        raise RuntimeError("bl_power 쓰기 권한 없음 (컨테이너 privileged 필요)") from e
    except Exception as e:
        raise RuntimeError(f"bl_power 쓰기 실패: {e}") from e


def _backlight_path(name: str) -> Path:
    return _BACKLIGHT_DIR / name


def read_display_brightness_percent() -> int | None:
    """현재 화면 밝기를 0~100% 로 반환."""
    try:
        current = int(_backlight_path("brightness").read_text().strip())
        maximum = int(_backlight_path("max_brightness").read_text().strip())
        if maximum == 0:
            return None
        return round(current / maximum * 100)
    except Exception:
        return None


def write_display_brightness_percent(percent: int) -> None:
    """화면 밝기 설정. percent: 0~100."""
    try:
        maximum = int(_backlight_path("max_brightness").read_text().strip())
    except Exception as e:
        raise RuntimeError("max_brightness를 읽을 수 없습니다.") from e
    raw = round(percent / 100 * maximum)
    try:
        _backlight_path("brightness").write_text(str(raw))
    except PermissionError as e:
        raise RuntimeError("밝기 쓰기 권한 없음 (컨테이너 privileged 필요)") from e


def read_battery_capacity() -> int | None:
    """현재 배터리 잔량(%) 읽기."""
    path = Path("/sys/class/power_supply/BAT0/capacity")
    if not path.exists():
        # BAT1 fallback
        path = Path("/sys/class/power_supply/BAT1/capacity")
    try:
        return int(path.read_text().strip())
    except Exception:
        return None


def read_cpu_temp() -> float | None:
    """CPU 온도(°C) 읽기. hwmon 중 가장 높은 값 반환."""
    candidates = glob.glob("/sys/class/hwmon/hwmon*/temp1_input")
    temps: list[float] = []
    for p in candidates:
        try:
            millideg = int(Path(p).read_text().strip())
            temps.append(millideg / 1000.0)
        except Exception:
            continue
    return max(temps) if temps else None
