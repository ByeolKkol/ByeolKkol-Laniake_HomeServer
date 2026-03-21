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
        conn.commit()
