import time

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from db import get_conn
from models import BatchIngest, DeviceHistoryResponse, ReadingPoint

router = APIRouter(tags=["readings"])

# Bucket sizes per query range (seconds)
_BUCKET_RULES: list[tuple[int, int]] = [
    (5 * 60,       10),        # ≤5m  → 10s
    (30 * 60,      60),        # ≤30m → 1min
    (60 * 60,      120),       # ≤1h  → 2min
    (6 * 60 * 60,  600),       # ≤6h  → 10min
    (24 * 60 * 60, 1800),      # ≤24h → 30min
    (7 * 86400,    7200),      # ≤7d  → 2h
    (30 * 86400,   21600),     # ≤30d → 6h
    (365 * 86400,  86400),     # ≤1y  → 1d
]


def _bucket_size(span: float) -> int:
    for limit, bucket in _BUCKET_RULES:
        if span <= limit:
            return bucket
    return 86400


@router.post("/readings/batch", status_code=204)
def ingest_batch(body: BatchIngest) -> Response:
    now = time.time()
    with get_conn() as conn:
        with conn.cursor() as cur:
            for r in body.readings:
                mac = r.mac_address.lower().strip()
                cur.execute(
                    "SELECT id FROM iot_devices WHERE mac_address = %s", (mac,)
                )
                row = cur.fetchone()
                if row is None:
                    continue  # unknown device — skip silently
                device_id: int = row["id"]
                ts = r.ts if r.ts is not None else now
                cur.execute(
                    "INSERT INTO iot_readings (device_id, ts, temperature, humidity) "
                    "VALUES (%s, %s, %s, %s)",
                    (device_id, ts, r.temperature, r.humidity),
                )
                cur.execute(
                    "UPDATE iot_devices SET battery_mv=%s, battery_pct=%s, rssi=%s, last_seen=%s "
                    "WHERE id=%s",
                    (r.battery_mv, r.battery_pct, r.rssi, ts, device_id),
                )
        conn.commit()
    return Response(status_code=204)


@router.get("/history/{device_id}", response_model=DeviceHistoryResponse)
def get_history(
    device_id: int,
    minutes: float | None = Query(None),
    start_ts: float | None = Query(None),
    end_ts: float | None = Query(None),
) -> DeviceHistoryResponse:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, location FROM iot_devices WHERE id = %s", (device_id,)
            )
            device = cur.fetchone()
            if device is None:
                raise HTTPException(404, "Device not found")

            now = time.time()
            if start_ts is not None and end_ts is not None:
                t_start, t_end = start_ts, end_ts
            elif minutes is not None:
                t_start = now - minutes * 60
                t_end = now
            else:
                t_start = now - 30 * 60
                t_end = now

            span = t_end - t_start
            bucket = _bucket_size(span)

            cur.execute("""
                SELECT
                    FLOOR(ts / %(b)s) * %(b)s AS ts,
                    AVG(temperature)           AS temperature,
                    AVG(humidity)              AS humidity
                FROM iot_readings
                WHERE device_id = %(did)s
                  AND ts BETWEEN %(t0)s AND %(t1)s
                GROUP BY 1
                ORDER BY 1
            """, {"b": bucket, "did": device_id, "t0": t_start, "t1": t_end})
            rows = cur.fetchall()

    points = [ReadingPoint(**row) for row in rows]
    return DeviceHistoryResponse(
        device_id=device_id,
        name=device["name"],
        location=device["location"],
        points=points,
    )
