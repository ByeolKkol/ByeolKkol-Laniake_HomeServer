"""시스템 메트릭 수집 — /proc 직접 읽기 (외부 의존성 없음)."""
import os
import time
from pathlib import Path

# /sys/class/net 호스트 마운트 경로 (docker-compose volume — /sys 전체 마운트)
_HOST_NET_DIR = Path("/host/sys/class/net")
_FALLBACK_NET_DIR = Path("/sys/class/net")

# CPU 이전 측정값 (프로세스 레벨 캐시)
_cpu_prev_idle: float = 0.0
_cpu_prev_total: float = 0.0


def read_cpu_usage() -> float:
    """CPU 사용률(%). /proc/stat 두 번 읽기 없이 마지막 값과 delta 계산."""
    global _cpu_prev_idle, _cpu_prev_total
    try:
        with open("/proc/stat") as f:
            line = f.readline()
        parts = line.split()
        # user nice system idle iowait irq softirq steal
        values = [float(x) for x in parts[1:]]
        idle = values[3] + (values[4] if len(values) > 4 else 0)
        total = sum(values)
        d_total = total - _cpu_prev_total
        d_idle = idle - _cpu_prev_idle
        _cpu_prev_total = total
        _cpu_prev_idle = idle
        if d_total <= 0:
            return 0.0
        return round((1.0 - d_idle / d_total) * 100.0, 1)
    except Exception:
        return 0.0


def read_memory() -> dict:
    """메모리 정보. /proc/meminfo 파싱."""
    info: dict[str, int] = {}
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    info[parts[0].rstrip(":")] = int(parts[1]) * 1024  # kB → bytes
    except Exception:
        pass

    total = info.get("MemTotal", 0)
    free = info.get("MemFree", 0)
    available = info.get("MemAvailable", 0)
    cached = info.get("Cached", 0) + info.get("SReclaimable", 0)
    buffers = info.get("Buffers", 0)
    used = max(0, total - free - cached - buffers)
    percent = round((total - available) / total * 100, 1) if total else 0.0

    return {
        "total": total,
        "used": used,
        "available": available,
        "cached": cached,
        "free": free,
        "percent": percent,
    }


def read_disks() -> list[dict]:
    """루트·EFI·스왑 디스크 사용량."""
    results: list[dict] = []

    efi_path = "/host/boot/efi" if Path("/host/boot/efi").exists() else "/boot/efi"
    for path, label in [("/", "/"), (efi_path, "/boot/efi")]:
        try:
            st = os.statvfs(path)
            total = st.f_blocks * st.f_frsize
            free = st.f_bavail * st.f_frsize
            used = total - free
            results.append({
                "mountpoint": label,
                "total": total,
                "used": used,
                "free": free,
                "percent": round(used / total * 100, 1) if total else 0.0,
            })
        except Exception:
            pass

    # 스왑: /proc/meminfo
    mem: dict[str, int] = {}
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    mem[parts[0].rstrip(":")] = int(parts[1]) * 1024
    except Exception:
        pass

    swap_total = mem.get("SwapTotal", 0)
    swap_free = mem.get("SwapFree", 0)
    swap_used = swap_total - swap_free
    results.append({
        "mountpoint": "swap",
        "total": swap_total,
        "used": swap_used,
        "free": swap_free,
        "percent": round(swap_used / swap_total * 100, 1) if swap_total else 0.0,
    })

    return results


_SKIP_IFACES = {"lo"}
_SKIP_PREFIXES = ("docker", "br-", "veth", "virbr")


def read_network() -> dict:
    """누적 네트워크 바이트 — /sys/class/net/<iface>/statistics/ 읽기."""
    net_dir = _HOST_NET_DIR if _HOST_NET_DIR.exists() else _FALLBACK_NET_DIR
    bytes_sent = 0
    bytes_recv = 0
    try:
        for iface_path in net_dir.iterdir():
            iface = iface_path.name
            if iface in _SKIP_IFACES or any(iface.startswith(p) for p in _SKIP_PREFIXES):
                continue
            try:
                rx = int((iface_path / "statistics" / "rx_bytes").read_text().strip())
                tx = int((iface_path / "statistics" / "tx_bytes").read_text().strip())
                bytes_recv += rx
                bytes_sent += tx
            except Exception:
                continue
    except Exception:
        pass
    return {"bytes_sent": bytes_sent, "bytes_recv": bytes_recv}


# 모듈 로드 시 CPU 베이스라인 초기화
try:
    with open("/proc/stat") as _f:
        _parts = _f.readline().split()
        _vals = [float(x) for x in _parts[1:]]
        _cpu_prev_idle = _vals[3] + (_vals[4] if len(_vals) > 4 else 0)
        _cpu_prev_total = sum(_vals)
except Exception:
    pass
