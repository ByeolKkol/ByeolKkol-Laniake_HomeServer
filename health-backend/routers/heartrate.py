import time

from fastapi import APIRouter, Query
from fastapi.responses import Response

from db import get_conn
from models import HeartrateBatch, HeartrateCreate, HeartratePoint, HeartrateRecord

router = APIRouter(prefix="/heartrate", tags=["heartrate"])

_BUCKET_RULES: list[tuple[int, int]] = [
    (30 * 60,      60),        # ≤30m → 1min
    (60 * 60,      120),       # ≤1h  → 2min
    (6 * 60 * 60,  600),       # ≤6h  → 10min
    (24 * 60 * 60, 1800),      # ≤24h → 30min
    (7 * 86400,    7200),      # ≤7d  → 2h
    (30 * 86400,   86400),     # ≤30d → 1d
]


def _bucket_size(span: float) -> int:
    for limit, bucket in _BUCKET_RULES:
        if span <= limit:
            return bucket
    return 86400


@router.get("", response_model=list[HeartratePoint])
def list_heartrate(
    minutes: float | None = Query(None),
    start_ts: float | None = Query(None),
    end_ts: float | None = Query(None),
) -> list[HeartratePoint]:
    now = time.time()
    if start_ts is not None and end_ts is not None:
        t_start, t_end = start_ts, end_ts
    elif minutes is not None:
        t_start, t_end = now - minutes * 60, now
    else:
        t_start, t_end = now - 24 * 3600, now

    bucket = _bucket_size(t_end - t_start)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT FLOOR(ts / %(b)s) * %(b)s AS ts, AVG(bpm) AS bpm
                FROM health_heartrate
                WHERE ts BETWEEN %(t0)s AND %(t1)s
                GROUP BY 1 ORDER BY 1
            """, {"b": bucket, "t0": t_start, "t1": t_end})
            rows = cur.fetchall()
    return [HeartratePoint(**r) for r in rows]


@router.post("", response_model=HeartrateRecord, status_code=201)
def push_heartrate(body: HeartrateCreate) -> HeartrateRecord:
    ts = body.ts if body.ts is not None else time.time()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO health_heartrate (ts, bpm, source) VALUES (%s,%s,%s) RETURNING *",
                (ts, body.bpm, body.source),
            )
            row = cur.fetchone()
        conn.commit()
    return HeartrateRecord(**row)


@router.post("/batch", status_code=204)
def push_heartrate_batch(body: HeartrateBatch) -> Response:
    now = time.time()
    with get_conn() as conn:
        with conn.cursor() as cur:
            for r in body.records:
                ts = r.ts if r.ts is not None else now
                cur.execute(
                    "INSERT INTO health_heartrate (ts, bpm, source) VALUES (%s,%s,%s)",
                    (ts, r.bpm, r.source),
                )
        conn.commit()
    return Response(status_code=204)
