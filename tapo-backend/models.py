from pydantic import BaseModel


class TapoDeviceIpUpdate(BaseModel):
    ip: str


class TapoDeviceResponse(BaseModel):
    id: int
    name: str
    cloud_id: str | None = None
    model: str | None = None
    ip: str | None = None
    created_at: float
    is_on: bool | None = None
    power_w: float | None = None
    today_energy_wh: int | None = None
    month_energy_wh: int | None = None
    last_seen: float | None = None


class TapoPowerPoint(BaseModel):
    ts: float
    power_w: float
    today_energy_wh: int | None = None


class TapoHistoryResponse(BaseModel):
    device_id: int
    name: str
    points: list[TapoPowerPoint]


class ElectricityRate(BaseModel):
    tier: int
    limit_kwh: int | None   # None = 마지막 구간 (무제한)
    base_won: int           # 기본요금
    rate_won: float         # 단가 (원/kWh)


class ElectricityRatesUpdate(BaseModel):
    rates: list[ElectricityRate]


class DeviceMonthlyUsage(BaseModel):
    device_id: int
    name: str
    kwh: float


class MonthlyUsage(BaseModel):
    month: str              # "2026-03"
    total_kwh: float
    estimated_won: int
    devices: list[DeviceMonthlyUsage]
