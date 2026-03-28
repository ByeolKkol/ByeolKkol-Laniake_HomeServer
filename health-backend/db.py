import os

import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://byeolkkol@db:5432/chzzk")


def get_conn() -> psycopg2.extensions.connection:
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def init_db() -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS health_weight (
                    id           SERIAL PRIMARY KEY,
                    ts           DOUBLE PRECISION NOT NULL,
                    weight_kg    REAL NOT NULL,
                    bmi          REAL,
                    body_fat_pct REAL,
                    muscle_kg    REAL,
                    bone_kg      REAL,
                    visceral_fat INTEGER,
                    water_pct    REAL,
                    bmr_kcal     INTEGER,
                    source       TEXT NOT NULL DEFAULT 'xiaomi'
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS health_weight_ts ON health_weight(ts)"
            )
            cur.execute("""
                CREATE TABLE IF NOT EXISTS health_heartrate (
                    id     SERIAL PRIMARY KEY,
                    ts     DOUBLE PRECISION NOT NULL,
                    bpm    INTEGER NOT NULL,
                    source TEXT NOT NULL DEFAULT 'galaxy_watch'
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS health_heartrate_ts ON health_heartrate(ts)"
            )
            # 중복 제거 후 unique index 생성
            cur.execute("""
                DELETE FROM health_heartrate a USING health_heartrate b
                WHERE a.id < b.id AND a.ts = b.ts AND a.source = b.source
            """)
            cur.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS health_heartrate_ts_source "
                "ON health_heartrate(ts, source)"
            )
            cur.execute("""
                CREATE TABLE IF NOT EXISTS health_exercise (
                    id           SERIAL PRIMARY KEY,
                    started_at   DOUBLE PRECISION NOT NULL,
                    ended_at     DOUBLE PRECISION NOT NULL,
                    type         TEXT,
                    duration_min INTEGER,
                    calories     INTEGER,
                    distance_m   INTEGER,
                    source       TEXT NOT NULL DEFAULT 'galaxy_watch'
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS health_exercise_started ON health_exercise(started_at)"
            )
            cur.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS health_exercise_started_source "
                "ON health_exercise(started_at, source)"
            )
            # ── 범용 지표 테이블 (걸음수, 거리, SpO2, HRV 등) ──
            cur.execute("""
                CREATE TABLE IF NOT EXISTS health_metric (
                    id     SERIAL PRIMARY KEY,
                    ts     DOUBLE PRECISION NOT NULL,
                    metric TEXT NOT NULL,
                    value  DOUBLE PRECISION NOT NULL,
                    source TEXT NOT NULL DEFAULT 'galaxy_watch'
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS health_metric_metric_ts "
                "ON health_metric(metric, ts)"
            )
            cur.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS health_metric_ts_metric_source "
                "ON health_metric(ts, metric, source)"
            )

            # ── 수면 테이블 ──
            cur.execute("""
                CREATE TABLE IF NOT EXISTS health_sleep (
                    id           SERIAL PRIMARY KEY,
                    started_at   DOUBLE PRECISION NOT NULL,
                    ended_at     DOUBLE PRECISION NOT NULL,
                    duration_min INTEGER,
                    source       TEXT NOT NULL DEFAULT 'galaxy_watch'
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS health_sleep_started "
                "ON health_sleep(started_at)"
            )
            cur.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS health_sleep_started_source "
                "ON health_sleep(started_at, source)"
            )

            # ── 수면 단계 테이블 ──
            cur.execute("""
                CREATE TABLE IF NOT EXISTS health_sleep_stage (
                    id              SERIAL PRIMARY KEY,
                    sleep_started_at DOUBLE PRECISION NOT NULL,
                    started_at      DOUBLE PRECISION NOT NULL,
                    ended_at        DOUBLE PRECISION NOT NULL,
                    stage           TEXT NOT NULL,
                    source          TEXT NOT NULL DEFAULT 'galaxy_watch'
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS health_sleep_stage_parent "
                "ON health_sleep_stage(sleep_started_at, source)"
            )
            cur.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS health_sleep_stage_uniq "
                "ON health_sleep_stage(sleep_started_at, started_at, source)"
            )
        conn.commit()
