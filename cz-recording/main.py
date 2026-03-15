import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import (
    Base,
    SessionLocal,
    engine,
    ensure_channel_schema,
    ensure_upload_schema,
    get_db,
    query_global_cookies,
)
from models import Channel, Cookie, Recording, UploadLog
from recorder import RecordingResult, start_streamlink_recording
from scanner import ChzzkScanner
from uploader import (
    GOOGLE_DRIVE_CREDENTIALS_FILE,
    ensure_drive_settings_file,
    get_drive_connection_status,
    upload_to_drive,
)

logger = logging.getLogger(__name__)

RECORDINGS_OUTPUT_DIR = os.getenv("RECORDINGS_OUTPUT_DIR", "./recordings")
GOOGLE_DRIVE_PARENT_ID = os.getenv("GOOGLE_DRIVE_PARENT_ID")
MAX_GOOGLE_DRIVE_CREDENTIALS_SIZE = 2 * 1024 * 1024
ALLOWED_QUALITIES = {"best", "1080p", "720p", "480p", "360p"}


class ChannelCreate(BaseModel):
    channel_id: str = Field(min_length=3, max_length=64)
    name: str | None = None
    quality: str = "best"
    is_active: bool = True


class ChannelUpdate(BaseModel):
    name: str | None = None
    quality: str | None = None
    is_active: bool | None = None


class CookieUpdate(BaseModel):
    nid_aut: str = Field(min_length=1)
    nid_ses: str = Field(min_length=1)


class RecordingStartRequest(BaseModel):
    channel_id: str | None = None


class RecordingUpdate(BaseModel):
    status: str | None = None
    title: str | None = None


class UploadCreate(BaseModel):
    recording_id: int
    destination: str = Field(min_length=1, max_length=128)
    status: str = "queued"
    message: str | None = None


def _utc_now() -> datetime:
    return datetime.now(tz=UTC)


def _serialize_channel(channel: Channel) -> dict[str, Any]:
    return {
        "id": channel.id,
        "channel_id": channel.channel_id,
        "name": channel.name,
        "quality": channel.quality,
        "is_active": channel.is_active,
        "created_at": channel.created_at,
        "updated_at": channel.updated_at,
    }


def _serialize_recording(
    recording: Recording,
    *,
    quality: str | None = None,
    thumbnail_url: str | None = None,
    display_name: str | None = None,
    title: str | None = None,
    upload_status: str | None = None,
) -> dict[str, Any]:
    return {
        "id": recording.id,
        "channel_id": recording.channel_id,
        "display_name": display_name,
        "stream_id": recording.stream_id,
        "title": title if title is not None else recording.title,
        "file_path": recording.file_path,
        "file_size_bytes": recording.file_size_bytes,
        "duration_seconds": recording.duration_seconds,
        "status": recording.status,
        "started_at": recording.started_at,
        "ended_at": recording.ended_at,
        "created_at": recording.created_at,
        "quality": quality,
        "thumbnail_url": thumbnail_url,
        "upload_status": upload_status,
    }


def _normalize_quality(raw: str | None) -> str:
    quality = (raw or "best").strip().lower()
    if quality not in ALLOWED_QUALITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid quality '{raw}'. Allowed: {', '.join(sorted(ALLOWED_QUALITIES))}",
        )
    return quality


def _extract_thumbnail_url(payload: dict[str, Any] | None) -> str | None:
    return ChzzkScanner._extract_thumbnail_url(payload)


async def _fetch_chzzk_live_detail(channel_id: str) -> dict[str, Any] | None:
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


def _extract_display_name(payload: dict[str, Any] | None) -> str | None:
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


def _extract_stream_title(payload: dict[str, Any] | None) -> str | None:
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


def _mask_cookie(value: str) -> str:
    if len(value) < 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


def _serialize_upload(upload: UploadLog) -> dict[str, Any]:
    return {
        "id": upload.id,
        "recording_id": upload.recording_id,
        "destination": upload.destination,
        "status": upload.status,
        "progress_percent": upload.progress_percent,
        "bytes_uploaded": upload.bytes_uploaded,
        "bytes_total": upload.bytes_total,
        "message": upload.message,
        "drive_file_id": upload.drive_file_id,
        "drive_file_url": upload.drive_file_url,
        "started_at": upload.started_at,
        "uploaded_at": upload.uploaded_at,
        "updated_at": upload.updated_at,
        "created_at": upload.created_at,
    }


def _get_global_cookie_map(db: Session) -> dict[str, str]:
    rows = (
        query_global_cookies(db, Cookie)
        .filter(Cookie.is_active.is_(True), Cookie.cookie_name.in_(["NID_AUT", "NID_SES"]))
        .order_by(Cookie.updated_at.desc(), Cookie.id.desc())
        .all()
    )
    cookie_map: dict[str, str] = {}
    for row in rows:
        if row.cookie_name not in cookie_map:
            cookie_map[row.cookie_name] = row.cookie_value
    return cookie_map


def _resolve_channel_by_external_id(db: Session, channel_external_id: str) -> Channel:
    channel = db.query(Channel).filter(Channel.channel_id == channel_external_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


async def _finalize_recording_task(
    app: FastAPI,
    recording_id: int,
    channel_external_id: str,
    task: asyncio.Task[RecordingResult],
) -> None:
    db: Session = SessionLocal()
    try:
        try:
            result = await task
        except asyncio.CancelledError:
            recording = db.query(Recording).filter(Recording.id == recording_id).first()
            if recording:
                recording.status = "cancelled"
                recording.ended_at = _utc_now()
                path_sink = app.state.recording_runtime.get(recording_id, {}).get("path_sink", [])
                if path_sink:
                    recording.file_path = path_sink[0]
                    try:
                        recording.file_size_bytes = os.path.getsize(path_sink[0])
                    except OSError:
                        recording.file_size_bytes = None
                db.commit()
            return
        except Exception as exc:
            logger.exception("Recording task failed recording_id=%s", recording_id)
            recording = db.query(Recording).filter(Recording.id == recording_id).first()
            if recording:
                recording.status = "failed"
                recording.ended_at = _utc_now()
                recording.title = recording.title or str(exc)
                path_sink = app.state.recording_runtime.get(recording_id, {}).get("path_sink", [])
                if path_sink:
                    recording.file_path = path_sink[0]
                    try:
                        recording.file_size_bytes = os.path.getsize(path_sink[0])
                    except OSError:
                        recording.file_size_bytes = None
                db.commit()
            return

        recording = db.query(Recording).filter(Recording.id == recording_id).first()
        if not recording:
            return

        recording.status = "completed" if result.succeeded else "failed"
        recording.file_path = result.output_file
        recording.started_at = result.started_at
        recording.ended_at = result.ended_at
        recording.duration_seconds = int((result.ended_at - result.started_at).total_seconds())
        try:
            recording.file_size_bytes = os.path.getsize(result.output_file)
        except OSError:
            recording.file_size_bytes = None
        db.commit()

        if result.succeeded and result.output_file:
            upload_db: Session = SessionLocal()
            try:
                upload_log = UploadLog(
                    recording_id=recording.id,
                    destination="google_drive",
                    status="queued",
                    progress_percent=0,
                    message="Queued for Google Drive upload",
                )
                upload_db.add(upload_log)
                upload_db.commit()
                upload_db.refresh(upload_log)
            finally:
                upload_db.close()

            app.state.upload_status[upload_log.id] = {
                "upload_log_id": upload_log.id,
                "recording_id": recording.id,
                "status": "queued",
                "message": "Queued for Google Drive upload",
                "progress_percent": 0,
                "updated_at": _utc_now(),
            }
            upload_task = asyncio.create_task(
                upload_to_drive(
                    db_factory=SessionLocal,
                    upload_log_id=upload_log.id,
                    file_path=result.output_file,
                    runtime_status=app.state.upload_status,
                    parent_folder_id=GOOGLE_DRIVE_PARENT_ID,
                )
            )
            app.state.upload_tasks[upload_log.id] = upload_task
            upload_task.add_done_callback(lambda _: app.state.upload_tasks.pop(upload_log.id, None))
    finally:
        db.close()
        app.state.recording_tasks.pop(recording_id, None)
        app.state.recording_runtime.pop(recording_id, None)
        app.state.active_channel_recordings.pop(channel_external_id, None)


async def _start_recording_for_channel(
    app: FastAPI,
    channel_external_id: str,
    *,
    payload: dict[str, Any] | None = None,
    stream_title: str | None = None,
    display_name: str | None = None,
    source: str = "manual",
) -> dict[str, Any]:
    async with app.state.recording_lock:
        if channel_external_id in app.state.active_channel_recordings:
            active_id = app.state.active_channel_recordings[channel_external_id]
            return {"message": "Recording already in progress", "recording_id": active_id}

        db: Session = SessionLocal()
        try:
            channel = _resolve_channel_by_external_id(db, channel_external_id)
            if not channel.is_active:
                raise HTTPException(status_code=400, detail="Channel is inactive")

            stream_id = None
            title = stream_title or channel.name or channel.channel_id
            if isinstance(payload, dict):
                stream_id = payload.get("liveId") or payload.get("streamId")
                title = _extract_stream_title(payload) or title
            resolved_display_name = display_name or channel.name or _extract_display_name(payload) or channel.channel_id

            recording = Recording(
                channel_id=channel.id,
                stream_id=stream_id,
                title=title,
                file_path="",
                status="recording",
                started_at=_utc_now(),
            )
            db.add(recording)
            db.commit()
            db.refresh(recording)

            cookies = _get_global_cookie_map(db)
            stream_url = f"https://chzzk.naver.com/live/{channel.channel_id}"
            quality = _normalize_quality(channel.quality)
            thumbnail_url = _extract_thumbnail_url(payload)
        finally:
            db.close()

        path_sink: list = []
        task = await start_streamlink_recording(
            channel_id=channel_external_id,
            display_name=resolved_display_name,
            stream_title=title,
            stream_url=stream_url,
            output_dir=RECORDINGS_OUTPUT_DIR,
            quality=quality,
            cookies=cookies or None,
            _path_sink=path_sink,
        )
        app.state.recording_tasks[recording.id] = task
        app.state.active_channel_recordings[channel_external_id] = recording.id
        app.state.recording_runtime[recording.id] = {"thumbnail_url": thumbnail_url, "path_sink": path_sink}
        scanner: ChzzkScanner | None = getattr(app.state, "scanner", None)
        if scanner:
            scanner.cache_thumbnail_url(channel_external_id, thumbnail_url)
        asyncio.create_task(_finalize_recording_task(app, recording.id, channel_external_id, task))

        logger.info(
            "Recording started channel=%s recording_id=%s source=%s",
            channel_external_id,
            recording.id,
            source,
        )
        return {"message": "Recording started", "recording_id": recording.id}


async def _on_channel_live(app: FastAPI, channel_id: str, payload: dict[str, Any]) -> None:
    detected_title = _extract_stream_title(payload)
    logger.info(
        "Scanner callback received channel=%s title=%s",
        channel_id,
        detected_title or "-",
    )
    try:
        await _start_recording_for_channel(
            app,
            channel_id,
            payload=payload,
            stream_title=detected_title,
            display_name=_extract_display_name(payload),
            source="scanner",
        )
    except HTTPException as exc:
        logger.warning("Scanner live callback ignored channel=%s detail=%s", channel_id, exc.detail)
    except Exception:
        logger.exception("Scanner live callback failed channel=%s", channel_id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_channel_schema()
    ensure_upload_schema()
    app.state.recording_tasks = {}
    app.state.active_channel_recordings = {}
    app.state.recording_runtime = {}
    app.state.upload_tasks = {}
    app.state.upload_status = {}
    app.state.recording_lock = asyncio.Lock()

    # 서버 재시작 시 orphan 상태 레코드 자동 정리
    _startup_db = SessionLocal()
    try:
        stale = _startup_db.query(Recording).filter(Recording.status.in_(["recording", "queued"])).all()
        for r in stale:
            r.status = "cancelled"
            r.ended_at = _utc_now()
        if stale:
            _startup_db.commit()
            logger.info("Startup: marked %d stale recording(s) as cancelled", len(stale))
    finally:
        _startup_db.close()

    scanner = ChzzkScanner(
        db_factory=SessionLocal,
        on_live=lambda channel_id, payload: _on_channel_live(app, channel_id, payload),
    )
    app.state.scanner = scanner
    scanner.start()
    await scanner.scan_once()

    try:
        yield
    finally:
        scanner.shutdown()
        tasks = list(app.state.recording_tasks.values()) + list(app.state.upload_tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="CHZZK Recorder API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, Any]:
    return {"service": "chzzk-recorder", "status": "ok"}


@app.get("/health")
def health_check() -> dict[str, Any]:
    import shutil
    try:
        disk = shutil.disk_usage(RECORDINGS_OUTPUT_DIR)
        disk_info = {
            "disk_free_bytes": disk.free,
            "disk_total_bytes": disk.total,
            "disk_used_percent": round(disk.used / disk.total * 100, 1),
        }
    except Exception:
        disk_info = {"disk_free_bytes": None, "disk_total_bytes": None, "disk_used_percent": None}
    return {
        "healthy": True,
        "scanner_running": bool(getattr(app.state.scanner, "_started", False)),
        "active_recordings": len(app.state.active_channel_recordings),
        **disk_info,
    }


@app.get("/channels")
def list_channels(db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.query(Channel).order_by(Channel.id.desc()).all()
    return {"items": [_serialize_channel(row) for row in rows]}


@app.post("/channels")
def create_channel(payload: ChannelCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    existing = db.query(Channel).filter(Channel.channel_id == payload.channel_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Channel already exists")

    channel = Channel(
        channel_id=payload.channel_id,
        name=payload.name or payload.channel_id,
        quality=_normalize_quality(payload.quality),
        is_active=payload.is_active,
    )
    db.add(channel)
    db.commit()
    db.refresh(channel)
    return {"item": _serialize_channel(channel), "message": "Channel created"}


@app.patch("/channels/{channel_id}")
def update_channel(channel_id: str, payload: ChannelUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    channel = _resolve_channel_by_external_id(db, channel_id)
    if payload.name is not None:
        channel.name = payload.name
    if payload.quality is not None:
        channel.quality = _normalize_quality(payload.quality)
    if payload.is_active is not None:
        channel.is_active = payload.is_active
    db.commit()
    db.refresh(channel)
    return {"item": _serialize_channel(channel), "message": "Channel updated"}


@app.delete("/channels/{channel_id}")
def delete_channel(channel_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    channel = _resolve_channel_by_external_id(db, channel_id)
    db.delete(channel)
    db.commit()
    return {"message": "Channel deleted"}


@app.get("/cookies")
def list_cookies(db: Session = Depends(get_db)) -> dict[str, Any]:
    cookie_map = _get_global_cookie_map(db)

    rows = (
        query_global_cookies(db, Cookie)
        .filter(Cookie.cookie_name.in_(["NID_AUT", "NID_SES"]))
        .order_by(Cookie.updated_at.desc(), Cookie.id.desc())
        .all()
    )
    latest_updated_at = rows[0].updated_at if rows else None

    return {
        "item": {
            "configured": bool(cookie_map.get("NID_AUT") and cookie_map.get("NID_SES")),
            "nid_aut_masked": _mask_cookie(cookie_map["NID_AUT"]) if cookie_map.get("NID_AUT") else None,
            "nid_ses_masked": _mask_cookie(cookie_map["NID_SES"]) if cookie_map.get("NID_SES") else None,
            "updated_at": latest_updated_at,
        }
    }


@app.put("/cookies")
def upsert_cookies(payload: CookieUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    new_values = {"NID_AUT": payload.nid_aut, "NID_SES": payload.nid_ses}
    for cookie_name, cookie_value in new_values.items():
        row = (
            query_global_cookies(db, Cookie)
            .filter(Cookie.cookie_name == cookie_name)
            .order_by(Cookie.updated_at.desc(), Cookie.id.desc())
            .first()
        )
        if row:
            row.cookie_value = cookie_value
            row.is_active = True
        else:
            db.add(
                Cookie(
                    channel_id=None,
                    cookie_name=cookie_name,
                    cookie_value=cookie_value,
                    is_active=True,
                )
            )
    db.commit()
    return {"message": "Global cookies saved"}


@app.get("/settings/google-drive")
def get_google_drive_settings() -> dict[str, Any]:
    return {"item": get_drive_connection_status()}


@app.post("/settings/google-drive")
async def upload_google_drive_credentials(credentials_file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await credentials_file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="credentials.json is empty")
    if len(raw) > MAX_GOOGLE_DRIVE_CREDENTIALS_SIZE:
        raise HTTPException(status_code=400, detail="credentials.json is too large")

    try:
        parsed = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="credentials.json must be valid UTF-8 JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="credentials.json must be a JSON object")

    GOOGLE_DRIVE_CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
    GOOGLE_DRIVE_CREDENTIALS_FILE.write_text(json.dumps(parsed, indent=2), encoding="utf-8")
    ensure_drive_settings_file()

    return {
        "message": "Google Drive credentials uploaded",
        "item": get_drive_connection_status(),
    }


@app.get("/recordings")
def list_recordings(
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    latest_upload_subquery = (
        db.query(
            UploadLog.recording_id.label("recording_id"),
            func.max(UploadLog.id).label("latest_upload_id"),
        )
        .group_by(UploadLog.recording_id)
        .subquery()
    )
    query = (
        db.query(
            Recording,
            Channel.quality.label("quality"),
            Channel.name.label("display_name"),
            Recording.title.label("recording_title"),
            UploadLog.status.label("upload_status"),
        )
        .outerjoin(Channel, Recording.channel_id == Channel.id)
        .outerjoin(latest_upload_subquery, latest_upload_subquery.c.recording_id == Recording.id)
        .outerjoin(UploadLog, UploadLog.id == latest_upload_subquery.c.latest_upload_id)
    )
    if status:
        query = query.filter(Recording.status == status)
    rows = query.order_by(Recording.id.desc()).limit(limit).all()
    return {
        "items": [
            _serialize_recording(
                recording,
                quality=quality,
                display_name=display_name,
                title=recording.title,
                upload_status=upload_status if upload_status else ("pending" if recording.file_path else None),
            )
            for recording, quality, display_name, recording_title, upload_status in rows
        ]
    }


@app.get("/recordings/active")
def list_active_recordings(db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = (
        db.query(Recording, Channel.quality, Channel.channel_id, Channel.name)
        .outerjoin(Channel, Recording.channel_id == Channel.id)
        .filter(Recording.status.in_(["recording", "queued"]))
        .order_by(Recording.started_at.desc())
        .all()
    )
    items = []
    scanner: ChzzkScanner | None = getattr(app.state, "scanner", None)
    for recording, quality, channel_external_id, channel_name in rows:
        runtime = app.state.recording_runtime.get(recording.id, {})
        thumbnail_url = runtime.get("thumbnail_url")
        if not thumbnail_url and scanner and channel_external_id:
            thumbnail_url = scanner.get_thumbnail_url(channel_external_id)
        
        serialized = _serialize_recording(
            recording,
            quality=quality,
            thumbnail_url=thumbnail_url,
            display_name=channel_name or channel_external_id,
            title=recording.title,
        )
        path_sink = runtime.get("path_sink", [])
        if path_sink:
            try:
                serialized["file_size_bytes"] = os.path.getsize(path_sink[0])
            except OSError:
                pass
        items.append(serialized)
    return {"items": items}


@app.post("/recordings/start")
async def start_recording(payload: RecordingStartRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    channel_id = payload.channel_id
    if not channel_id:
        channel = db.query(Channel).filter(Channel.is_active.is_(True)).order_by(Channel.id.asc()).first()
        if not channel:
            raise HTTPException(status_code=400, detail="No active channels configured")
        channel_id = channel.channel_id

    live_payload = await _fetch_chzzk_live_detail(channel_id)
    return await _start_recording_for_channel(
        app,
        channel_id,
        payload=live_payload,
        stream_title=_extract_stream_title(live_payload),
        display_name=_extract_display_name(live_payload),
        source="manual",
    )


@app.post("/recordings/{recording_id}/stop")
async def stop_recording(recording_id: int) -> dict[str, Any]:
    task = app.state.recording_tasks.get(recording_id)
    if not task:
        raise HTTPException(status_code=404, detail="No active recording found with this ID")
    task.cancel()
    return {"message": "Recording stop requested", "recording_id": recording_id}


@app.patch("/recordings/{recording_id}")
def update_recording(
    recording_id: int,
    payload: RecordingUpdate,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    if payload.status is not None:
        recording.status = payload.status
    if payload.title is not None:
        recording.title = payload.title
    db.commit()
    db.refresh(recording)
    return {"item": _serialize_recording(recording), "message": "Recording updated"}


@app.delete("/recordings/{recording_id}")
def delete_recording(recording_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    if recording_id in app.state.recording_tasks:
        raise HTTPException(status_code=409, detail="Cannot delete an active recording")

    file_deleted = False
    file_path = recording.file_path
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
            file_deleted = True
        except OSError as exc:
            logger.warning("Failed deleting recording file recording_id=%s path=%s error=%s", recording_id, file_path, exc)

    db.query(UploadLog).filter(UploadLog.recording_id == recording_id).delete(synchronize_session=False)
    db.delete(recording)
    db.commit()

    app.state.recording_runtime.pop(recording_id, None)
    for channel_external_id, active_recording_id in list(app.state.active_channel_recordings.items()):
        if active_recording_id == recording_id:
            app.state.active_channel_recordings.pop(channel_external_id, None)

    return {"message": "Recording deleted", "file_deleted": file_deleted}


@app.get("/proxy/thumbnail")
async def proxy_thumbnail(url: str = Query(min_length=1, max_length=2048)) -> Response:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Invalid thumbnail URL")

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


@app.post("/recordings/{recording_id}/retry-upload")
async def retry_recording_upload(recording_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    if not recording.file_path:
        raise HTTPException(status_code=400, detail="Recording file path is missing")

    latest_upload = (
        db.query(UploadLog)
        .filter(UploadLog.recording_id == recording_id)
        .order_by(UploadLog.id.desc())
        .first()
    )
    if not latest_upload:
        raise HTTPException(status_code=409, detail="No upload history found for this recording")
    if latest_upload.status != "failed":
        raise HTTPException(
            status_code=409,
            detail=f"Retry is only allowed for failed uploads (latest status: {latest_upload.status})",
        )

    upload_log = UploadLog(
        recording_id=recording.id,
        destination="google_drive",
        status="queued",
        progress_percent=0,
        message="Retry queued for Google Drive upload",
    )
    db.add(upload_log)
    db.commit()
    db.refresh(upload_log)

    app.state.upload_status[upload_log.id] = {
        "upload_log_id": upload_log.id,
        "recording_id": recording.id,
        "status": "queued",
        "message": upload_log.message,
        "progress_percent": 0,
        "updated_at": _utc_now(),
    }

    upload_task = asyncio.create_task(
        upload_to_drive(
            db_factory=SessionLocal,
            upload_log_id=upload_log.id,
            file_path=recording.file_path,
            runtime_status=app.state.upload_status,
            parent_folder_id=GOOGLE_DRIVE_PARENT_ID,
        )
    )
    app.state.upload_tasks[upload_log.id] = upload_task
    upload_task.add_done_callback(lambda _: app.state.upload_tasks.pop(upload_log.id, None))

    return {"message": "Upload retry queued", "item": _serialize_upload(upload_log)}


@app.post("/upload")
def upload_recording(payload: UploadCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    recording = db.query(Recording).filter(Recording.id == payload.recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    log = UploadLog(
        recording_id=payload.recording_id,
        destination=payload.destination,
        status=payload.status,
        message=payload.message,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"message": "Upload log created", "item": {"id": log.id, "status": log.status}}


@app.get("/upload/status")
def get_upload_status(
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    query = db.query(UploadLog)
    if status:
        query = query.filter(UploadLog.status == status)
    rows = query.order_by(UploadLog.id.desc()).limit(limit).all()

    task_state = []
    for upload_id, runtime in sorted(app.state.upload_status.items(), key=lambda item: item[0], reverse=True):
        if status and runtime.get("status") != status:
            continue
        task_state.append({"upload_log_id": upload_id, **runtime})

    return {
        "items": [_serialize_upload(row) for row in rows],
        "active_uploads": len(app.state.upload_tasks),
        "runtime": task_state[:limit],
    }
