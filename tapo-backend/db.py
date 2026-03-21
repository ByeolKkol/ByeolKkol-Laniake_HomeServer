import os
import time

import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://byeolkkol@db:5432/chzzk")

_THREE_YEARS = 3 * 365 * 24 * 3600


def get_conn() -> psycopg2.extensions.connection:
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def init_db() -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS tapo_devices (
                    id               SERIAL PRIMARY KEY,
                    name             TEXT NOT NULL,
                    cloud_id         TEXT UNIQUE,
                    model            TEXT,
                    created_at       DOUBLE PRECISION NOT NULL,
                    is_on            BOOLEAN,
                    power_w          REAL,
                    today_energy_wh  INTEGER,
                    month_energy_wh  INTEGER,
                    last_seen        DOUBLE PRECISION
                )
            """)
            # Migrate: add cloud_id/model if table existed with old schema
            cur.execute("ALTER TABLE tapo_devices ADD COLUMN IF NOT EXISTS cloud_id TEXT")
            cur.execute("ALTER TABLE tapo_devices ADD COLUMN IF NOT EXISTS model TEXT")
            cur.execute("ALTER TABLE tapo_devices ALTER COLUMN ip DROP NOT NULL")
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE tapo_devices DROP CONSTRAINT tapo_devices_ip_key;
                EXCEPTION WHEN undefined_object THEN NULL;
                END $$
            """)
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE tapo_devices ADD CONSTRAINT tapo_devices_cloud_id_key UNIQUE (cloud_id);
                EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
                END $$
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS tapo_readings (
                    id               SERIAL PRIMARY KEY,
                    device_id        INTEGER NOT NULL REFERENCES tapo_devices(id) ON DELETE CASCADE,
                    ts               DOUBLE PRECISION NOT NULL,
                    power_w          REAL,
                    today_energy_wh  INTEGER
                )
            """)
            cur.execute("ALTER TABLE tapo_readings ALTER COLUMN power_w DROP NOT NULL")
            cur.execute(
                "CREATE INDEX IF NOT EXISTS tapo_readings_device_ts "
                "ON tapo_readings(device_id, ts)"
            )

            cur.execute("""
                CREATE TABLE IF NOT EXISTS app_settings (
                    key   TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS electricity_rates (
                    tier      INTEGER PRIMARY KEY,
                    limit_kwh INTEGER,
                    base_won  INTEGER NOT NULL DEFAULT 0,
                    rate_won  REAL NOT NULL
                )
            """)
            # 기본 한국 주택용 누진세 요금 (없을 때만 삽입)
            cur.execute("SELECT COUNT(*) FROM electricity_rates")
            if cur.fetchone()["count"] == 0:
                cur.executemany(
                    "INSERT INTO electricity_rates (tier, limit_kwh, base_won, rate_won) "
                    "VALUES (%s, %s, %s, %s)",
                    [(1, 200, 910, 120.0), (2, 400, 1600, 214.6), (3, None, 7300, 307.3)],
                )
        conn.commit()


def cleanup_old() -> None:
    cutoff = time.time() - _THREE_YEARS
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM tapo_readings WHERE ts < %s", (cutoff,))
        conn.commit()
