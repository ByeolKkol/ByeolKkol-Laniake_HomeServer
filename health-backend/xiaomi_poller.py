"""Xiaomi 클라우드 체중계 폴러.

S800 체중계 도착 후 활성화 절차:
1. 환경변수 XIAOMI_USERNAME, XIAOMI_PASSWORD, XIAOMI_REGION(cn/de/us/sg) 설정
2. 서버 기동 후 `GET /weight/xiaomi/devices` 로 device_id 확인
3. 환경변수 XIAOMI_DEVICE_ID 설정 후 재기동

의존성: micloud (requirements.txt에 포함)
"""
from __future__ import annotations

import asyncio
import logging
import os
import time

logger = logging.getLogger(__name__)

XIAOMI_USERNAME = os.getenv("XIAOMI_USERNAME", "")
XIAOMI_PASSWORD = os.getenv("XIAOMI_PASSWORD", "")
XIAOMI_REGION = os.getenv("XIAOMI_REGION", "cn")
XIAOMI_DEVICE_ID = os.getenv("XIAOMI_DEVICE_ID", "")

_POLL_INTERVAL = int(os.getenv("XIAOMI_POLL_INTERVAL", "1800"))  # 30분


def _is_configured() -> bool:
    return bool(XIAOMI_USERNAME and XIAOMI_PASSWORD and XIAOMI_DEVICE_ID)


def fetch_latest_weight() -> dict | None:
    """Xiaomi 클라우드에서 최신 체중 데이터 조회.

    Returns:
        체중 데이터 dict 또는 None (미설정/오류 시).
    """
    if not _is_configured():
        return None
    try:
        from micloud import MiCloud  # type: ignore[import]

        cloud = MiCloud(XIAOMI_USERNAME, XIAOMI_PASSWORD)
        cloud.login(XIAOMI_REGION)

        # S800 체중계 데이터 조회
        # NOTE: S800 도착 후 실제 API 경로 및 응답 필드명 확인 필요
        data = cloud.get_devices()
        device = next((d for d in data if d.get("did") == XIAOMI_DEVICE_ID), None)
        if device is None:
            logger.warning("Xiaomi device_id=%s not found in cloud", XIAOMI_DEVICE_ID)
            return None

        return device  # 실제 체중 데이터 파싱은 S800 확인 후 구현
    except ImportError:
        logger.error("micloud not installed — pip install micloud")
        return None
    except Exception as exc:
        logger.warning("Xiaomi poll failed: %s", exc)
        return None


def list_devices() -> list[dict]:
    """Xiaomi 클라우드에 등록된 기기 목록 조회 (device_id 확인용)."""
    if not (XIAOMI_USERNAME and XIAOMI_PASSWORD):
        return []
    try:
        from micloud import MiCloud  # type: ignore[import]

        cloud = MiCloud(XIAOMI_USERNAME, XIAOMI_PASSWORD)
        cloud.login(XIAOMI_REGION)
        devices = cloud.get_devices()
        return [
            {"did": d.get("did"), "name": d.get("name"), "model": d.get("model")}
            for d in (devices or [])
        ]
    except Exception as exc:
        logger.warning("Xiaomi device list failed: %s", exc)
        return []


async def poll_loop(save_fn: "Callable[[dict], None]") -> None:  # noqa: F821
    """백그라운드 폴링 루프. save_fn에 체중 데이터 dict를 전달."""
    if not _is_configured():
        logger.info("Xiaomi poller disabled — XIAOMI_DEVICE_ID not set")
        return

    logger.info("Xiaomi poller started (interval=%ds)", _POLL_INTERVAL)
    while True:
        try:
            data = await asyncio.get_event_loop().run_in_executor(None, fetch_latest_weight)
            if data:
                save_fn(data)
        except Exception as exc:
            logger.warning("Xiaomi poll loop error: %s", exc)
        await asyncio.sleep(_POLL_INTERVAL)
