import asyncio
import re


async def _run(*args: str) -> str:
    """asusctl 명령 실행 후 stdout 반환. 실패 시 RuntimeError."""
    proc = await asyncio.create_subprocess_exec(
        "asusctl", *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(stderr.decode().strip())
    return stdout.decode().strip()


async def get_battery_limit() -> int | None:
    """현재 배터리 충전 제한(%) 조회."""
    try:
        output = await _run("battery", "info")
        # "Current battery charge limit: 60%"
        match = re.search(r"(\d+)%", output)
        return int(match.group(1)) if match else None
    except Exception:
        return None


async def set_battery_limit(limit: int) -> None:
    """배터리 충전 제한 설정."""
    await _run("battery", "limit", str(limit))


async def get_profile() -> str | None:
    """현재 활성 팬 프로필 조회."""
    try:
        output = await _run("profile", "get")
        # "Active profile: Quiet"
        match = re.search(r"Active profile:\s*(\w+)", output)
        return match.group(1) if match else None
    except Exception:
        return None


async def set_profile(profile: str) -> None:
    """팬 프로필 변경."""
    await _run("profile", "set", profile)


async def set_led_static(color: str) -> None:
    """LED 색상 설정 (static 모드). color는 6자리 hex."""
    await _run("aura", "effect", "static", "-c", color)
