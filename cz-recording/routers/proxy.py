from __future__ import annotations

import ipaddress
import logging
import socket

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from urllib.parse import urlparse

router = APIRouter(tags=["proxy"])
logger = logging.getLogger(__name__)

_ALLOWED_HOSTS = {"naver.com", "chzzk.naver.com", "phinf.pstatic.net", "livecloud-thumb.akamaized.net"}


def _is_safe_url(url: str) -> bool:
    """외부 URL만 허용. 내부 IP 및 허용 도메인 외 차단."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    hostname = parsed.hostname or ""
    if any(hostname.endswith(h) for h in _ALLOWED_HOSTS):
        return True
    try:
        addr = ipaddress.ip_address(socket.gethostbyname(hostname))
        return addr.is_global
    except (socket.gaierror, ValueError):
        return False


@router.get("/proxy/thumbnail")
async def proxy_thumbnail(url: str = Query(min_length=1, max_length=2048)) -> Response:
    if not _is_safe_url(url):
        raise HTTPException(status_code=400, detail="URL not allowed")

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": "https://chzzk.naver.com/",
        "Origin": "https://chzzk.naver.com",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            upstream = await client.get(url, headers=headers)
        if upstream.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Thumbnail upstream returned {upstream.status_code}")
        content_type = upstream.headers.get("content-type", "image/jpeg")
        return Response(
            content=upstream.content,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=30"},
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Thumbnail proxy failed url=%s error=%s", url, exc)
        raise HTTPException(status_code=502, detail="Thumbnail proxy failed") from exc
