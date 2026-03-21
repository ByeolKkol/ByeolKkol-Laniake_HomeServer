from __future__ import annotations

import logging
from typing import Any

import httpx
from scanner import ChzzkScanner

logger = logging.getLogger(__name__)


async def fetch_chzzk_live_detail(channel_id: str) -> dict[str, Any] | None:
    url = f"https://api.chzzk.naver.com/service/v2/channels/{channel_id}/live-detail"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": f"https://chzzk.naver.com/{channel_id}",
        "Origin": "https://chzzk.naver.com",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
            content = data.get("content") if isinstance(data, dict) else None
            if not isinstance(content, dict):
                logger.info("Live detail: no content for channel=%s (offline or null)", channel_id)
                return None
            logger.info(
                "Live detail fetched channel=%s status=%s title=%s",
                channel_id,
                content.get("status") or "null",
                content.get("liveTitle") or "-",
            )
            return content
    except Exception:
        logger.warning("Failed to fetch live detail for channel %s", channel_id, exc_info=True)
        return None


def extract_thumbnail_url(payload: dict[str, Any] | None) -> str | None:
    return ChzzkScanner._extract_thumbnail_url(payload)


def extract_display_name(payload: dict[str, Any] | None) -> str | None:
    if not isinstance(payload, dict):
        return None
    for key in ("channelName", "displayName", "streamerName", "nickname", "name"):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    nested_channel = payload.get("channel")
    if isinstance(nested_channel, dict):
        for key in ("channelName", "displayName", "name"):
            value = nested_channel.get(key)
            if isinstance(value, str) and value:
                return value
    return None


def extract_stream_title(payload: dict[str, Any] | None) -> str | None:
    if not isinstance(payload, dict):
        return None
    for key in ("liveTitle", "title", "streamTitle", "broadcastTitle"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    nested_live = payload.get("live")
    if isinstance(nested_live, dict):
        for key in ("title", "liveTitle", "streamTitle"):
            value = nested_live.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None
