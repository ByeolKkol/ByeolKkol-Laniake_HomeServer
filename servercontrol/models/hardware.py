from typing import Literal

from pydantic import BaseModel, Field


class BatteryLimitRequest(BaseModel):
    limit: int = Field(..., ge=20, le=100, description="배터리 충전 제한 (20~100%)")


class ProfileRequest(BaseModel):
    profile: Literal["Quiet", "Balanced", "Performance"]


class LedRequest(BaseModel):
    color: str = Field("000000", pattern=r"^[0-9a-fA-F]{6}$", description="RGB 색상 hex (e.g. ff0000)")


class DisplayBrightnessRequest(BaseModel):
    brightness: int = Field(..., ge=0, le=100, description="화면 밝기 (0~100%)")


class HardwareStatus(BaseModel):
    battery_capacity: int | None = Field(None, description="현재 배터리 잔량 (%)")
    battery_limit: int | None = Field(None, description="설정된 충전 제한 (%)")
    profile: str | None = Field(None, description="현재 팬 프로필")
    cpu_temp: float | None = Field(None, description="CPU 온도 (°C)")
    display_brightness: int | None = Field(None, description="화면 밝기 (0~100%)")


class HealthResponse(BaseModel):
    status: str


class MemoryInfo(BaseModel):
    total: int = Field(description="전체 메모리 (bytes)")
    used: int = Field(description="사용 중 (bytes)")
    available: int = Field(description="사용 가능 (bytes)")
    cached: int = Field(description="캐시 (bytes)")
    free: int = Field(description="비어 있음 (bytes)")
    percent: float = Field(description="사용률 (%)")


class DiskInfo(BaseModel):
    mountpoint: str
    total: int = Field(description="전체 용량 (bytes)")
    used: int
    free: int
    percent: float


class NetworkInfo(BaseModel):
    bytes_sent: int = Field(description="누적 송신 bytes")
    bytes_recv: int = Field(description="누적 수신 bytes")


class SystemMetrics(BaseModel):
    cpu_usage: float = Field(description="CPU 사용률 (%)")
    memory: MemoryInfo
    disks: list[DiskInfo]
    network: NetworkInfo
