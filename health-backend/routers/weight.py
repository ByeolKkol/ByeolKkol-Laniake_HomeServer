import time

from fastapi import APIRouter, HTTPException, Query, Response

from db import get_conn
from models import WeightCreate, WeightRecord

router = APIRouter(prefix="/weight", tags=["weight"])

_BUCKET_RULES: list[tuple[int, int]] = [
    (7 * 86400,    86400),      # ≤7d  → 1d
    (30 * 86400,   86400),      # ≤30d → 1d
    (365 * 86400,  86400 * 7),  # ≤1y  → 1w
]


def _bucket_size(span: float) -> int:
    for limit, bucket in _BUCKET_RULES:
        if span <= limit:
            return bucket
    return 86400 * 30


@router.get("", response_model=list[WeightRecord])
def list_weight(
    limit: int = Query(50, ge=1, le=500),
    start_ts: float | None = Query(None),
    end_ts: float | None = Query(None),
) -> list[WeightRecord]:
    now = time.time()
    t_start = start_ts if start_ts is not None else now - 90 * 86400
    t_end = end_ts if end_ts is not None else now
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM health_weight WHERE ts BETWEEN %s AND %s "
                "ORDER BY ts DESC LIMIT %s",
                (t_start, t_end, limit),
            )
            rows = cur.fetchall()
    return [WeightRecord(**r) for r in rows]


@router.get("/latest", response_model=WeightRecord)
def latest_weight() -> WeightRecord:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM health_weight ORDER BY ts DESC LIMIT 1")
            row = cur.fetchone()
    if row is None:
        raise HTTPException(404, "No weight records found")
    return WeightRecord(**row)


@router.post("", response_model=WeightRecord, status_code=201)
def push_weight(body: WeightCreate) -> WeightRecord:
    ts = body.ts if body.ts is not None else time.time()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO health_weight
                   (ts, weight_kg, bmi, body_fat_pct, muscle_kg, bone_kg,
                    visceral_fat, water_pct, bmr_kcal, source)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
                (ts, body.weight_kg, body.bmi, body.body_fat_pct, body.muscle_kg,
                 body.bone_kg, body.visceral_fat, body.water_pct, body.bmr_kcal,
                 body.source),
            )
            row = cur.fetchone()
        conn.commit()
    return WeightRecord(**row)


@router.delete("/{record_id}", status_code=204, response_class=Response)
def delete_weight(record_id: int) -> Response:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM health_weight WHERE id = %s", (record_id,))
            if cur.rowcount == 0:
                raise HTTPException(404, "Record not found")
        conn.commit()
    return Response(status_code=204)
