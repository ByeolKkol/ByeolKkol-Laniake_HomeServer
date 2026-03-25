"""PostgreSQL 기반 메트릭 이력 저장소."""
import os
import time
from typing import Any

import psycopg2
import psycopg2.extras

DATABASE_URL: str = os.environ.get(
    "DATABASE_URL",
    "postgresql://byeolkkol@db:5432/chzzk",
)
RETENTION_SECONDS = 86400   # 24시간 보관
COLLECT_INTERVAL_S = 10     # 10초마다 수집

# 허용된 컬럼 이름 화이트리스트 (SQL injection 방지)
_ALLOWED_COLUMNS: frozenset[str] = frozenset({
    "cpu_pct", "mem_pct", "cpu_temp", "net_recv_bps", "net_sent_bps",
})


def _conn() -> psycopg2.extensions.connection:
    return psycopg2.connect(DATABASE_URL)


def init_db() -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS server_metric_samples (
                id           BIGSERIAL PRIMARY KEY,
                ts           DOUBLE PRECISION NOT NULL,
                cpu_pct      REAL NOT NULL,
                mem_pct      REAL NOT NULL,
                cpu_temp     REAL,
                net_recv_bps REAL,
                net_sent_bps REAL
            )
        """)
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_sms_ts ON server_metric_samples(ts)"
        )
        # 기존 테이블에 컬럼 추가 (마이그레이션)
        for col in ("net_recv_bps", "net_sent_bps"):
            if col not in _ALLOWED_COLUMNS:
                raise ValueError(f"Disallowed column name: {col}")
            cur.execute(
                f"ALTER TABLE server_metric_samples ADD COLUMN IF NOT EXISTS {col} REAL"
            )


def insert_sample(
    cpu_pct: float,
    mem_pct: float,
    cpu_temp: float | None,
    net_recv_bps: float | None = None,
    net_sent_bps: float | None = None,
) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO server_metric_samples"
            " (ts, cpu_pct, mem_pct, cpu_temp, net_recv_bps, net_sent_bps)"
            " VALUES (%s, %s, %s, %s, %s, %s)",
            (time.time(), cpu_pct, mem_pct, cpu_temp, net_recv_bps, net_sent_bps),
        )


def cleanup_old() -> None:
    cutoff = time.time() - RETENTION_SECONDS
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM server_metric_samples WHERE ts < %s", (cutoff,)
        )


def query_range(minutes: int) -> list[dict[str, Any]]:
    """지정된 기간의 버켓 평균 샘플을 반환합니다. 최대 ~120포인트."""
    range_seconds = minutes * 60
    bucket_size = max(COLLECT_INTERVAL_S, range_seconds // 120)
    cutoff = time.time() - range_seconds

    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    FLOOR(ts / %(bs)s) * %(bs)s  AS bucket_ts,
                    AVG(cpu_pct)                  AS cpu_pct,
                    AVG(mem_pct)                  AS mem_pct,
                    AVG(cpu_temp)                 AS cpu_temp,
                    AVG(net_recv_bps)             AS net_recv_bps,
                    AVG(net_sent_bps)             AS net_sent_bps
                FROM server_metric_samples
                WHERE ts >= %(cutoff)s
                GROUP BY FLOOR(ts / %(bs)s)
                ORDER BY bucket_ts
                """,
                {"bs": bucket_size, "cutoff": cutoff},
            )
            rows = cur.fetchall()

    return [
        {
            "ts":           float(row["bucket_ts"]),
            "cpu_pct":      round(float(row["cpu_pct"]), 1),
            "mem_pct":      round(float(row["mem_pct"]), 1),
            "cpu_temp":     round(float(row["cpu_temp"]), 1) if row["cpu_temp"] is not None else None,
            "net_recv_bps": round(float(row["net_recv_bps"])) if row["net_recv_bps"] is not None else None,
            "net_sent_bps": round(float(row["net_sent_bps"])) if row["net_sent_bps"] is not None else None,
        }
        for row in rows
    ]
