from pydantic import BaseModel


class DeviceCreate(BaseModel):
    name: str
    location: str = ""
    mac_address: str


class DeviceResponse(BaseModel):
    id: int
    name: str
    mac_address: str
    created_at: float
    temperature: float | None = None
    humidity: float | None = None
    battery_mv: int | None = None
    battery_pct: int | None = None
    rssi: int | None = None
    last_seen: float | None = None


class ReadingIngest(BaseModel):
    mac_address: str
    temperature: float
    humidity: float
    battery_mv: int | None = None
    battery_pct: int | None = None
    rssi: int | None = None
    ts: float | None = None


class BatchIngest(BaseModel):
    readings: list[ReadingIngest]


class ReadingPoint(BaseModel):
    ts: float
    temperature: float
    humidity: float


class DeviceHistoryResponse(BaseModel):
    device_id: int
    name: str
    location: str
    points: list[ReadingPoint]
