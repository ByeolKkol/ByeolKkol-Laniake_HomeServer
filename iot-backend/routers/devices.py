import time

from fastapi import APIRouter, HTTPException

from db import get_conn
from models import DeviceCreate, DeviceResponse

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("", response_model=list[DeviceResponse])
def list_devices() -> list[DeviceResponse]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    d.id, d.name, d.mac_address, d.created_at,
                    d.battery_mv, d.battery_pct, d.rssi, d.last_seen,
                    r.temperature, r.humidity
                FROM iot_devices d
                LEFT JOIN LATERAL (
                    SELECT temperature, humidity
                    FROM iot_readings
                    WHERE device_id = d.id
                    ORDER BY ts DESC
                    LIMIT 1
                ) r ON true
                ORDER BY d.created_at ASC
            """)
            rows = cur.fetchall()
    return [DeviceResponse(**row) for row in rows]


@router.post("", response_model=DeviceResponse, status_code=201)
def add_device(body: DeviceCreate) -> DeviceResponse:
    mac = body.mac_address.lower().strip()
    now = time.time()
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "INSERT INTO iot_devices (name, location, mac_address, created_at) "
                    "VALUES (%s, %s, %s, %s) RETURNING id",
                    (body.name, body.location, mac, now),
                )
                device_id: int = cur.fetchone()["id"]
            except Exception as e:
                if "unique" in str(e).lower():
                    raise HTTPException(400, "MAC address already registered") from e
                raise
        conn.commit()
    return DeviceResponse(
        id=device_id, name=body.name, location=body.location,
        mac_address=mac, created_at=now,
    )


@router.delete("/{device_id}", status_code=204)
def delete_device(device_id: int) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM iot_devices WHERE id = %s RETURNING id", (device_id,))
            if cur.fetchone() is None:
                raise HTTPException(404, "Device not found")
        conn.commit()
