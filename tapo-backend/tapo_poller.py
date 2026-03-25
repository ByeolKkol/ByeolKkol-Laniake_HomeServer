import asyncio
import logging
import os
import time
from typing import Any, TypedDict

from credentials import get_tapo_credentials
from db import get_conn
from tapo_cloud import TapoCloud

logger = logging.getLogger(__name__)

POLL_INTERVAL = 5  # seconds

_cloud: TapoCloud | None = None


async def get_cloud() -> TapoCloud:
    global _cloud
    if _cloud is None:
        username, password = get_tapo_credentials()
        _cloud = TapoCloud(username, password)
        await _cloud.login()
        await _cloud.sync_devices()
    return _cloud


def _upsert_devices(plugs: list[dict[str, Any]], cloud: TapoCloud) -> None:
    now = time.time()
    with get_conn() as conn:
        with conn.cursor() as cur:
            for d in plugs:
                cloud_id = d["deviceId"]
                name = cloud.device_name(d)
                model = d.get("deviceModel", "")
                ip = d.get("deviceIP") or None
                cur.execute("""
                    INSERT INTO tapo_devices (name, cloud_id, model, ip, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (cloud_id) DO UPDATE
                        SET name = EXCLUDED.name,
                            model = EXCLUDED.model,
                            ip = CASE WHEN EXCLUDED.ip IS NOT NULL THEN EXCLUDED.ip
                                      ELSE tapo_devices.ip END
                """, (name, cloud_id, model, ip, now))
        conn.commit()


class PollResult(TypedDict):
    is_on: bool
    power_w: float | None
    today_energy_wh: int
    month_energy_wh: int


async def _poll_local(ip: str) -> PollResult:
    """Poll a single device via local KLAP protocol."""
    from tapo import ApiClient
    username, password = get_tapo_credentials()
    client = ApiClient(username, password)
    plug = await client.p110(ip)
    info = await plug.get_device_info()
    energy = await plug.get_energy_usage()
    raw_w = energy.current_power / 1000.0
    return {
        "is_on": bool(info.device_on),
        "power_w": raw_w if 0 <= raw_w < 5000 else None,
        "today_energy_wh": energy.today_energy,
        "month_energy_wh": energy.month_energy,
    }


async def poll_once() -> None:
    username, password = get_tapo_credentials()
    if not username or not password:
        logger.warning("TAPO credentials not set, skipping poll")
        return

    cloud = await get_cloud()
    plugs = await cloud.sync_devices()
    _upsert_devices(plugs, cloud)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, cloud_id, ip FROM tapo_devices WHERE cloud_id IS NOT NULL"
            )
            devices = list(cur.fetchall())

    now = time.time()

    for device in devices:
        device_id: int = device["id"]
        cloud_id: str = device["cloud_id"]
        ip: str = device.get("ip") or ""

        if not ip:
            logger.warning("Device %s has no local IP, skipping", cloud_id[:8])
            continue

        try:
            data = await _poll_local(ip)
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE tapo_devices SET is_on=%s, power_w=%s, "
                        "today_energy_wh=%s, month_energy_wh=%s, last_seen=%s "
                        "WHERE id=%s",
                        (data["is_on"], data["power_w"], data["today_energy_wh"],
                         data["month_energy_wh"], now, device_id),
                    )
                    if data["is_on"] and data["power_w"] is not None and data["power_w"] < 5000:
                        cur.execute(
                            "INSERT INTO tapo_readings (device_id, ts, power_w, today_energy_wh) "
                            "VALUES (%s, %s, %s, %s)",
                            (device_id, now, data["power_w"], data["today_energy_wh"]),
                        )
                conn.commit()
            logger.info(
                "Polled %s (%s): on=%s power=%.1fW today=%dWh",
                cloud_id[:8], ip, data["is_on"], data["power_w"], data["today_energy_wh"],
            )
        except Exception as e:
            logger.warning("Failed to poll %s (%s): %s", cloud_id[:8], ip, e)


async def poll_loop() -> None:
    while True:
        await asyncio.sleep(POLL_INTERVAL)
        try:
            await poll_once()
        except Exception as e:
            logger.error("Tapo poll loop error: %s", e)
