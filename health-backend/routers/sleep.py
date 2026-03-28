import time

from fastapi import APIRouter, HTTPException, Query

from db import get_conn
from models import SleepCreate, SleepRecord, SleepStage

router = APIRouter(prefix="/sleep", tags=["sleep"])


def _attach_stages(rows: list[dict], source_filter: str | None = None) -> list[SleepRecord]:
    if not rows:
        return []
    started_ats = [r["started_at"] for r in rows]
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM health_sleep_stage WHERE sleep_started_at = ANY(%s) "
                "ORDER BY started_at",
                (started_ats,),
            )
            stage_rows = cur.fetchall()
    stage_map: dict[float, list[SleepStage]] = {}
    for s in stage_rows:
        stage_map.setdefault(s["sleep_started_at"], []).append(
            SleepStage(started_at=s["started_at"], ended_at=s["ended_at"], stage=s["stage"])
        )
    return [SleepRecord(**r, stages=stage_map.get(r["started_at"], [])) for r in rows]


@router.get("", response_model=list[SleepRecord])
def list_sleep(
    limit: int = Query(50, ge=1, le=500),
    start_ts: float | None = Query(None),
    end_ts: float | None = Query(None),
) -> list[SleepRecord]:
    now = time.time()
    t_start = start_ts if start_ts is not None else now - 30 * 86400
    t_end = end_ts if end_ts is not None else now
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM health_sleep WHERE started_at BETWEEN %s AND %s "
                "ORDER BY started_at DESC LIMIT %s",
                (t_start, t_end, limit),
            )
            rows = cur.fetchall()
    return _attach_stages(rows)


@router.get("/latest", response_model=SleepRecord | None)
def latest_sleep() -> SleepRecord | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM health_sleep ORDER BY started_at DESC LIMIT 1"
            )
            row = cur.fetchone()
    if not row:
        return None
    return _attach_stages([row])[0]


@router.post("", response_model=SleepRecord, status_code=201)
def push_sleep(body: SleepCreate) -> SleepRecord:
    if body.ended_at <= body.started_at:
        raise HTTPException(400, "ended_at must be after started_at")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO health_sleep (started_at, ended_at, duration_min, source)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (started_at, source) DO NOTHING
                   RETURNING *""",
                (body.started_at, body.ended_at, body.duration_min, body.source),
            )
            row = cur.fetchone()
            # stages 저장 (중복 무시)
            for s in body.stages:
                cur.execute(
                    """INSERT INTO health_sleep_stage
                       (sleep_started_at, started_at, ended_at, stage, source)
                       VALUES (%s, %s, %s, %s, %s)
                       ON CONFLICT (sleep_started_at, started_at, source) DO NOTHING""",
                    (body.started_at, s.started_at, s.ended_at, s.stage, body.source),
                )
        conn.commit()
    if row is None:
        return SleepRecord(id=0, started_at=body.started_at, ended_at=body.ended_at,
                           duration_min=body.duration_min, source=body.source,
                           stages=[SleepStage(**s.model_dump()) for s in body.stages])
    return SleepRecord(**row, stages=[SleepStage(**s.model_dump()) for s in body.stages])
