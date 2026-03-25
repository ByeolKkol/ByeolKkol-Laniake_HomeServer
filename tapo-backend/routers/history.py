import time

from fastapi import APIRouter, HTTPException, Query

from db import get_conn
from models import TapoHistoryResponse, TapoPowerPoint
from utils import bucket_size

router = APIRouter(tags=["history"])


@router.get("/history/{device_id}", response_model=TapoHistoryResponse)
def get_history(
    device_id: int,
    minutes: float | None = Query(None),
    start_ts: float | None = Query(None),
    end_ts: float | None = Query(None),
) -> TapoHistoryResponse:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM tapo_devices WHERE id = %s", (device_id,))
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

            bucket = bucket_size(t_end - t_start)

            cur.execute("""
                SELECT
                    FLOOR(ts / %(b)s) * %(b)s  AS ts,
                    AVG(power_w)               AS power_w,
                    MAX(today_energy_wh)       AS today_energy_wh
                FROM tapo_readings
                WHERE device_id = %(did)s
                  AND ts BETWEEN %(t0)s AND %(t1)s
                  AND power_w < 5000
                GROUP BY 1
                ORDER BY 1
            """, {"b": bucket, "did": device_id, "t0": t_start, "t1": t_end})
            rows = cur.fetchall()

    return TapoHistoryResponse(
        device_id=device_id,
        name=device["name"],
        points=[TapoPowerPoint(**row) for row in rows],
    )
