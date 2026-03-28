"""Health Auto Export 앱 웹훅 수신 엔드포인트.

앱 설정: Settings → Export Format → REST API
Webhook URL: http://<서버IP>:8095/webhook/health-auto-export
"""
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from fastapi.responses import Response

from db import get_conn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook", tags=["webhook"])


def _parse_ts(date_str: str) -> float:
    """HAE 날짜 문자열 → Unix timestamp."""
    for fmt in (
        "%Y-%m-%d %H:%M:%S %z",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.timestamp()
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {date_str!r}")


def _ingest_heartrate(metrics: list[dict[str, Any]]) -> int:
    records: list[tuple[float, int]] = []
    for metric in metrics:
        if metric.get("name") != "heart_rate":
            continue
        for point in metric.get("data", []):
            try:
                ts = _parse_ts(point["date"])
                raw_bpm = point.get("Avg") or point.get("avg") or point.get("bpm")
                if raw_bpm is None:
                    continue
                bpm = int(round(float(raw_bpm)))
                records.append((ts, bpm))
            except Exception as e:
                logger.warning("Skip HR point %s: %s", point, e)

    if not records:
        return 0

    inserted = 0
    with get_conn() as conn:
        with conn.cursor() as cur:
            for ts, bpm in records:
                cur.execute(
                    """INSERT INTO health_heartrate (ts, bpm, source)
                       VALUES (%s, %s, 'health_connect')
                       ON CONFLICT (ts, source) DO NOTHING""",
                    (ts, bpm),
                )
                inserted += cur.rowcount
        conn.commit()
    return inserted


def _parse_qty(value: Any) -> int | None:
    """HAE qty 필드 파싱: {"qty": 300.5, "units": "kcal"} 또는 "300.5 kcal"."""
    if value is None:
        return None
    if isinstance(value, dict):
        qty = value.get("qty")
        return int(round(float(qty))) if qty is not None else None
    try:
        return int(round(float(str(value).split()[0])))
    except Exception:
        return None


def _ingest_workouts(workouts: list[dict[str, Any]]) -> int:
    inserted = 0
    with get_conn() as conn:
        with conn.cursor() as cur:
            for w in workouts:
                try:
                    started_at = _parse_ts(w["start"])
                    ended_at = _parse_ts(w["end"])
                    if ended_at <= started_at:
                        continue

                    duration_min: int | None = None
                    raw_dur = w.get("duration")
                    if raw_dur is not None:
                        try:
                            duration_min = int(round(float(str(raw_dur).split()[0])))
                        except Exception:
                            pass

                    cur.execute(
                        """INSERT INTO health_exercise
                           (started_at, ended_at, type, duration_min, calories, distance_m, source)
                           VALUES (%s, %s, %s, %s, %s, %s, 'health_connect')
                           ON CONFLICT (started_at, source) DO NOTHING""",
                        (
                            started_at,
                            ended_at,
                            w.get("name"),
                            duration_min,
                            _parse_qty(w.get("activeEnergy") or w.get("totalEnergyBurned")),
                            _parse_qty(w.get("distance") or w.get("totalDistance")),
                        ),
                    )
                    inserted += cur.rowcount
                except Exception as e:
                    logger.warning("Skip workout %s: %s", w.get("name"), e)
        conn.commit()
    return inserted


@router.post("/health-auto-export", status_code=204)
def receive_hae(payload: dict[str, Any]) -> Response:
    """Health Auto Export 앱 웹훅 수신."""
    data = payload.get("data", payload)
    hr_count = _ingest_heartrate(data.get("metrics", []))
    ex_count = _ingest_workouts(data.get("workouts", []))
    logger.info("HAE webhook: heartrate=%d, workouts=%d", hr_count, ex_count)
    return Response(status_code=204)
