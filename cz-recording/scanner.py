import asyncio
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session, sessionmaker

from models import Channel

logger = logging.getLogger(__name__)


LiveCallback = Callable[[str, dict[str, Any]], Awaitable[None]]


@dataclass
class ChannelStatus:
    channel_id: str
    is_live: bool
    payload: dict[str, Any]


class ChzzkScanner:
    """
    Polls CHZZK API every minute and emits callbacks when channels go live.
    """

    def __init__(
        self,
        *,
        db_factory: sessionmaker,
        on_live: LiveCallback | None = None,
        api_timeout_seconds: float = 10.0,
    ) -> None:
        self._db_factory = db_factory
        self._on_live = on_live
        self._api_timeout_seconds = api_timeout_seconds
        self._scheduler = AsyncIOScheduler()
        self._started = False
        self._last_live_state: dict[str, bool] = {}
        self._thumbnail_cache: dict[str, str] = {}

    def start(self) -> None:
        if self._started:
            return
        self._scheduler.add_job(
            self.scan_once,
            "interval",
            minutes=1,
            id="chzzk-scan",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=30,
        )
        self._scheduler.start()
        self._started = True
        logger.info("CHZZK scanner started (interval=1 minute)")

    def shutdown(self) -> None:
        if not self._started:
            return
        self._scheduler.shutdown(wait=False)
        self._started = False
        logger.info("CHZZK scanner stopped")

    async def scan_once(self) -> None:
        channel_ids = await asyncio.to_thread(self._load_active_channel_ids)
        if not channel_ids:
            logger.debug("No active channels configured for scanning")
            return
        logger.info("Running CHZZK scan for %s active channel(s)", len(channel_ids))

        async with httpx.AsyncClient(timeout=self._api_timeout_seconds) as client:
            tasks = [self._fetch_channel_status(client, channel_id) for channel_id in channel_ids]
            statuses = await asyncio.gather(*tasks, return_exceptions=True)

        for item in statuses:
            if isinstance(item, Exception):
                logger.exception("Error while scanning channel", exc_info=item)
                continue
            await self._process_status(item)

    def _load_active_channel_ids(self) -> list[str]:
        db: Session = self._db_factory()
        try:
            rows = db.query(Channel.channel_id).filter(Channel.is_active.is_(True)).all()
            return [row[0] for row in rows if row[0]]
        finally:
            db.close()

    async def _fetch_channel_status(self, client: httpx.AsyncClient, channel_id: str) -> ChannelStatus:
        url = f"https://api.chzzk.naver.com/service/v2/channels/{channel_id}/live-detail"
        logger.debug("Fetching live status channel_id=%s", channel_id)
        try:
            response = await client.get(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Referer": f"https://chzzk.naver.com/{channel_id}",
                    "Origin": "https://chzzk.naver.com",
                },
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("content") if isinstance(data, dict) else None
            if not isinstance(content, dict):
                content = {}
        except Exception as exc:
            logger.warning("Channel status fetch failed channel=%s error=%s", channel_id, exc)
            return ChannelStatus(channel_id=channel_id, is_live=False, payload={})

        # CHZZK API: status == "OPEN" is the only reliable live indicator.
        # liveId and liveTitle persist from the previous broadcast even when offline (status == "CLOSE").
        is_live = content.get("status") == "OPEN"
        logger.info(
            "Scanned channel_id=%s status=%s is_live=%s title=%s",
            channel_id,
            content.get("status") or "null",
            is_live,
            content.get("liveTitle") or "-",
        )
        return ChannelStatus(channel_id=channel_id, is_live=is_live, payload=content)

    async def _process_status(self, status: ChannelStatus) -> None:
        previous = self._last_live_state.get(status.channel_id, False)
        self._last_live_state[status.channel_id] = status.is_live
        thumbnail_url = self._extract_thumbnail_url(status.payload)
        if status.is_live and thumbnail_url:
            self._thumbnail_cache[status.channel_id] = thumbnail_url
        elif not status.is_live:
            self._thumbnail_cache.pop(status.channel_id, None)

        if status.is_live and not previous:
            logger.info(
                "Live stream detected channel_id=%s title=%s",
                status.channel_id,
                status.payload.get("liveTitle") or status.payload.get("title") or "-",
            )
            if self._on_live:
                try:
                    await self._on_live(status.channel_id, status.payload)
                except Exception:
                    logger.exception("on_live callback failed channel_id=%s", status.channel_id)
        elif status.is_live:
            logger.debug("Channel still live channel_id=%s", status.channel_id)
        elif previous and not status.is_live:
            logger.info("Channel no longer live channel_id=%s", status.channel_id)

    def get_thumbnail_url(self, channel_id: str) -> str | None:
        return self._thumbnail_cache.get(channel_id)

    def cache_thumbnail_url(self, channel_id: str, thumbnail_url: str | None) -> None:
        if not channel_id:
            return
        if thumbnail_url:
            self._thumbnail_cache[channel_id] = thumbnail_url

    @staticmethod
    def _extract_thumbnail_url(payload: dict[str, Any] | None) -> str | None:
        if not isinstance(payload, dict):
            return None
        candidates: list[str] = []
        for key in ("liveImageUrl", "defaultThumbnailImageUrl", "thumbnailImageUrl", "thumbnailUrl"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                candidates.extend(ChzzkScanner._expand_thumbnail_template(value))

        nested_channel = payload.get("channel")
        if isinstance(nested_channel, dict):
            for key in ("liveImageUrl", "defaultThumbnailImageUrl", "thumbnailImageUrl", "thumbnailUrl"):
                value = nested_channel.get(key)
                if isinstance(value, str) and value:
                    candidates.extend(ChzzkScanner._expand_thumbnail_template(value))

        seen: set[str] = set()
        ordered_unique = [url for url in candidates if not (url in seen or seen.add(url))]
        if ordered_unique:
            return max(ordered_unique, key=ChzzkScanner._thumbnail_rank)

        return ChzzkScanner._extract_profile_image_url(payload)

    @staticmethod
    def _extract_profile_image_url(payload: dict[str, Any]) -> str | None:
        candidates: list[str] = []
        for key in ("channelImageUrl", "channelProfileImageUrl", "profileImageUrl", "profileThumbnailImageUrl"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                candidates.append(value)

        nested_channel = payload.get("channel")
        if isinstance(nested_channel, dict):
            for key in ("channelImageUrl", "channelProfileImageUrl", "profileImageUrl", "profileThumbnailImageUrl"):
                value = nested_channel.get(key)
                if isinstance(value, str) and value:
                    candidates.append(value)

        return candidates[0] if candidates else None

    @staticmethod
    def _expand_thumbnail_template(url: str) -> list[str]:
        urls = [url]
        if "{size}" in url:
            urls.extend(url.replace("{size}", size) for size in ("1080", "720", "480", "360", "270"))
        if "{type}" in url:
            expanded: list[str] = []
            for item in urls:
                expanded.append(item.replace("{type}", "1080"))
                expanded.append(item.replace("{type}", "720"))
            urls = expanded
        return urls

    @staticmethod
    def _thumbnail_rank(url: str) -> int:
        quality = 0
        numeric_sizes = [int(match.group(1)) for match in re.finditer(r"_(\d{2,4})(?:\.|$)", url)]
        if numeric_sizes:
            quality = max(numeric_sizes)
        elif "{size}" in url:
            quality = 1080

        if "{type}" in url:
            quality += 1

        return quality
