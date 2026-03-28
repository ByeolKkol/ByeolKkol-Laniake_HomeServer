import time

from fastapi import APIRouter, HTTPException, Query

from db import get_conn
from models import ExerciseCreate, ExerciseRecord

router = APIRouter(prefix="/exercise", tags=["exercise"])


@router.get("", response_model=list[ExerciseRecord])
def list_exercise(
    limit: int = Query(50, ge=1, le=500),
    start_ts: float | None = Query(None),
    end_ts: float | None = Query(None),
) -> list[ExerciseRecord]:
    now = time.time()
    t_start = start_ts if start_ts is not None else now - 90 * 86400
    t_end = end_ts if end_ts is not None else now
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM health_exercise WHERE started_at BETWEEN %s AND %s "
                "ORDER BY started_at DESC LIMIT %s",
                (t_start, t_end, limit),
            )
            rows = cur.fetchall()
    return [ExerciseRecord(**r) for r in rows]


@router.post("", response_model=ExerciseRecord, status_code=201)
def push_exercise(body: ExerciseCreate) -> ExerciseRecord:
    if body.ended_at <= body.started_at:
        raise HTTPException(400, "ended_at must be after started_at")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO health_exercise
                   (started_at, ended_at, type, duration_min, calories, distance_m, source)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (started_at, source) DO NOTHING
                   RETURNING *""",
                (body.started_at, body.ended_at, body.type, body.duration_min,
                 body.calories, body.distance_m, body.source),
            )
            row = cur.fetchone()
        conn.commit()
    if row is None:
        return ExerciseRecord(id=0, started_at=body.started_at, ended_at=body.ended_at,
                              type=body.type, duration_min=body.duration_min,
                              calories=body.calories, distance_m=body.distance_m, source=body.source)
    return ExerciseRecord(**row)
