from fastapi import APIRouter

from models.hardware import DiskInfo, MemoryInfo, NetworkInfo, SystemMetrics
from services import sysinfo

router = APIRouter()


@router.get("/metrics", response_model=SystemMetrics)
def get_metrics() -> SystemMetrics:
    """CPU 사용률·메모리·디스크·네트워크 시스템 메트릭 조회."""
    return SystemMetrics(
        cpu_usage=sysinfo.read_cpu_usage(),
        memory=MemoryInfo(**sysinfo.read_memory()),
        disks=[DiskInfo(**d) for d in sysinfo.read_disks()],
        network=NetworkInfo(**sysinfo.read_network()),
    )
