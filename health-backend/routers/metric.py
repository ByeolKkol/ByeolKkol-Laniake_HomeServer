import time

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from db import get_conn
from models import (
    VALID_METRICS,
    MetricBatch,
    MetricCreate,
    MetricPoint,
    MetricRecord,
)

router = APIRouter(prefix="/metric", tags=["metric"])

_BUCKET_RULES: list[tuple[int, int]] = [
    (6 * 3600, 600),        # ≤6h  → 10min
    (24 * 3600, 1800),      # ≤24h → 30min
    (7 * 86400, 7200),      # ≤7d  → 2h
    (30 * 86400, 86400),    # ≤30d → 1d
]


def _bucket_size(span: float) -> int:
    for limit, bucket in _BUCKET_RULES:
        if span <= limit:
            return bucket
    return 86400


@router.get("", response_model=list[MetricPoint])
def list_metric(
    metric: str = Query(...),
    minutes: float | None = Query(None),
    start_ts: float | None = Query(None),
    end_ts: float | None = Query(None),
) -> list[MetricPoint]:
    if metric not in VALID_METRICS:
        raise HTTPException(400, f"Invalid metric: {metric}")
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
                SELECT FLOOR(ts / %(b)s) * %(b)s AS ts, AVG(value) AS value
                FROM health_metric
                WHERE metric = %(m)s AND ts BETWEEN %(t0)s AND %(t1)s
                GROUP BY 1 ORDER BY 1
            """, {"b": bucket, "m": metric, "t0": t_start, "t1": t_end})
            rows = cur.fetchall()
    return [MetricPoint(**r) for r in rows]


@router.get("/latest", response_model=MetricRecord | None)
def latest_metric(metric: str = Query(...)) -> MetricRecord | None:
    if metric not in VALID_METRICS:
        raise HTTPException(400, f"Invalid metric: {metric}")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM health_metric WHERE metric = %s ORDER BY ts DESC LIMIT 1",
                (metric,),
            )
            row = cur.fetchone()
    return MetricRecord(**row) if row else None


@router.post("", response_model=MetricRecord, status_code=201)
def push_metric(body: MetricCreate) -> MetricRecord:
    if body.metric not in VALID_METRICS:
        raise HTTPException(400, f"Invalid metric: {body.metric}")
    ts = body.ts if body.ts is not None else time.time()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO health_metric (ts, metric, value, source)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (ts, metric, source) DO NOTHING
                   RETURNING *""",
                (ts, body.metric, body.value, body.source),
            )
            row = cur.fetchone()
        conn.commit()
    if row is None:
        raise HTTPException(409, "Duplicate record")
    return MetricRecord(**row)


@router.post("/batch", status_code=204)
def push_metric_batch(body: MetricBatch) -> Response:
    now = time.time()
    with get_conn() as conn:
        with conn.cursor() as cur:
            for r in body.records:
                if r.metric not in VALID_METRICS:
                    continue
                ts = r.ts if r.ts is not None else now
                cur.execute(
                    """INSERT INTO health_metric (ts, metric, value, source)
                       VALUES (%s, %s, %s, %s)
                       ON CONFLICT (ts, metric, source) DO NOTHING""",
                    (ts, r.metric, r.value, r.source),
                )
        conn.commit()
    return Response(status_code=204)
