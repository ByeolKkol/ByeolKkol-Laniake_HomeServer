from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from credentials import get_tapo_credentials
from db import get_conn
from models import TapoDeviceIpUpdate, TapoDeviceResponse
from tapo_poller import get_cloud, poll_once

router = APIRouter(prefix="/devices", tags=["devices"])


def _get_device_ip(device_id: int) -> str:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ip FROM tapo_devices WHERE id = %s", (device_id,))
            row = cur.fetchone()
    if row is None:
        raise HTTPException(404, "Device not found")
    ip = row.get("ip") or ""
    if not ip:
        raise HTTPException(503, "Device has no local IP")
    return ip


@router.get("", response_model=list[TapoDeviceResponse])
def list_devices() -> list[TapoDeviceResponse]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, name, cloud_id, model, ip, created_at, is_on,
                       power_w, today_energy_wh, month_energy_wh, last_seen
                FROM tapo_devices ORDER BY created_at ASC
            """)
            rows = cur.fetchall()
    return [TapoDeviceResponse(**row) for row in rows]


@router.post("/sync", status_code=204)
async def sync_devices() -> Response:
    """Trigger immediate cloud sync + poll to discover and refresh all devices."""
    try:
        await poll_once()
    except Exception as e:
        raise HTTPException(503, str(e)) from e
    return Response(status_code=204)


@router.patch("/{device_id}/ip", status_code=204)
def set_device_ip(device_id: int, body: TapoDeviceIpUpdate) -> Response:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE tapo_devices SET ip = %s WHERE id = %s RETURNING id",
                (body.ip, device_id),
            )
            if cur.fetchone() is None:
                raise HTTPException(404, "Device not found")
        conn.commit()
    return Response(status_code=204)


@router.delete("/{device_id}", status_code=204)
def delete_device(device_id: int) -> Response:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM tapo_devices WHERE id = %s RETURNING id", (device_id,))
            if cur.fetchone() is None:
                raise HTTPException(404, "Device not found")
        conn.commit()
    return Response(status_code=204)


@router.post("/{device_id}/on", status_code=204)
async def turn_on(device_id: int) -> Response:
    ip = _get_device_ip(device_id)
    try:
        from tapo import ApiClient
        username, password = get_tapo_credentials()
        client = ApiClient(username, password)
        plug = await client.p110(ip)
        await plug.on()
    except Exception as e:
        raise HTTPException(503, f"Device unreachable: {e}") from e
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE tapo_devices SET is_on = true WHERE id = %s", (device_id,))
        conn.commit()
    return Response(status_code=204)


@router.post("/{device_id}/off", status_code=204)
async def turn_off(device_id: int) -> Response:
    ip = _get_device_ip(device_id)
    try:
        from tapo import ApiClient
        username, password = get_tapo_credentials()
        client = ApiClient(username, password)
        plug = await client.p110(ip)
        await plug.off()
    except Exception as e:
        raise HTTPException(503, f"Device unreachable: {e}") from e
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE tapo_devices SET is_on = false WHERE id = %s", (device_id,))
        conn.commit()
    return Response(status_code=204)
