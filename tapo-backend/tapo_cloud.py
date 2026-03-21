"""
Local device controller using the tapo KLAP protocol.
Requires Third-Party Compatibility enabled in the Tapo app.
"""
import base64
import httpx
import json
import logging
import uuid

logger = logging.getLogger(__name__)

CLOUD_URL = "https://wap.tplinkcloud.com"

_PLUG_TYPES = {"SMART.TAPOPLUG"}
_ENERGY_MODELS = {"P110", "P115", "P110M", "P115M", "KP115", "EP25"}


def _is_energy_plug(device: dict) -> bool:
    model: str = device.get("deviceModel", "")
    dtype: str = device.get("deviceType", "")
    return dtype in _PLUG_TYPES and any(m in model for m in _ENERGY_MODELS)


def _decode_alias(alias: str) -> str:
    try:
        return base64.b64decode(alias).decode("utf-8")
    except Exception:
        return alias


class TapoCloud:
    """Discovers devices from the Tapo cloud account (for auto-sync),
    then controls them via local KLAP protocol."""

    def __init__(self, email: str, password: str) -> None:
        self.email = email
        self.password = password
        self.token: str | None = None
        self.terminal_uuid = str(uuid.uuid4())
        self._by_cloud_id: dict[str, dict] = {}

    async def login(self) -> None:
        async with httpx.AsyncClient() as c:
            r = await c.post(CLOUD_URL, json={
                "method": "login",
                "params": {
                    "appType": "Tapo_Android",
                    "cloudUserName": self.email,
                    "cloudPassword": self.password,
                    "terminalUUID": self.terminal_uuid,
                    "refreshTokenNeeded": False,
                }
            }, timeout=10)
            data = r.json()
        if data.get("error_code", -1) != 0:
            raise Exception(f"Cloud login failed: {data}")
        self.token = data["result"]["token"]
        logger.info("Cloud login OK")

    async def sync_devices(self) -> list[dict]:
        async with httpx.AsyncClient() as c:
            r = await c.post(
                f"{CLOUD_URL}?token={self.token}",
                json={"method": "getDeviceList"},
                timeout=10,
            )
            data = r.json()
        if data.get("error_code", -1) != 0:
            raise Exception(f"getDeviceList failed: {data}")
        devices: list[dict] = data["result"]["deviceList"]
        self._by_cloud_id = {d["deviceId"]: d for d in devices}
        plugs = [d for d in devices if _is_energy_plug(d)]
        logger.info("Cloud sync: %d total, %d energy plugs", len(devices), len(plugs))
        return plugs

    def device_name(self, device: dict) -> str:
        return _decode_alias(device.get("alias", device.get("deviceModel", "Unknown")))
