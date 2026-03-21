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
                CREATE TABLE IF NOT EXISTS iot_devices (
                    id          SERIAL PRIMARY KEY,
                    name        TEXT NOT NULL,
                    location    TEXT NOT NULL DEFAULT '',
                    mac_address TEXT NOT NULL UNIQUE,
                    created_at  DOUBLE PRECISION NOT NULL,
                    battery_mv  INTEGER,
                    battery_pct INTEGER,
                    rssi        INTEGER,
                    last_seen   DOUBLE PRECISION
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS iot_readings (
                    id          SERIAL PRIMARY KEY,
                    device_id   INTEGER NOT NULL REFERENCES iot_devices(id) ON DELETE CASCADE,
                    ts          DOUBLE PRECISION NOT NULL,
                    temperature REAL NOT NULL,
                    humidity    REAL NOT NULL
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS iot_readings_device_ts "
                "ON iot_readings(device_id, ts)"
            )
            # migration: move battery/rssi columns from readings to devices
            cur.execute("ALTER TABLE iot_readings DROP COLUMN IF EXISTS battery_mv")
            cur.execute("ALTER TABLE iot_readings DROP COLUMN IF EXISTS battery_pct")
            cur.execute("ALTER TABLE iot_devices ADD COLUMN IF NOT EXISTS battery_mv INTEGER")
            cur.execute("ALTER TABLE iot_devices ADD COLUMN IF NOT EXISTS battery_pct INTEGER")
            cur.execute("ALTER TABLE iot_devices ADD COLUMN IF NOT EXISTS rssi INTEGER")
            cur.execute("ALTER TABLE iot_devices ADD COLUMN IF NOT EXISTS last_seen DOUBLE PRECISION")
        conn.commit()


def cleanup_old() -> None:
    cutoff = time.time() - _THREE_YEARS
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM iot_readings WHERE ts < %s", (cutoff,))
        conn.commit()
