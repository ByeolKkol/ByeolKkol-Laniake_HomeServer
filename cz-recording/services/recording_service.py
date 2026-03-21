from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from fastapi import FastAPI, HTTPException
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Channel, Recording, UploadLog
from serializers import utc_now

logger = logging.getLogger(__name__)

ALLOWED_QUALITIES = {"best", "1080p60", "1080p", "720p60", "720p", "480p", "360p", "worst"}
GOOGLE_DRIVE_PARENT_ID: str | None = None  # main.py에서 주입


def set_google_drive_parent_id(folder_id: str | None) -> None:
    global GOOGLE_DRIVE_PARENT_ID
    GOOGLE_DRIVE_PARENT_ID = folder_id


def normalize_quality(raw: str | None) -> str:
    quality = (raw or "best").strip().lower()
    if quality not in ALLOWED_QUALITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid quality '{raw}'. Allowed: {', '.join(sorted(ALLOWED_QUALITIES))}",
        )
    return quality


def resolve_channel_by_external_id(db: Session, channel_external_id: str) -> Channel:
    channel = db.query(Channel).filter(Channel.channel_id == channel_external_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


async def finalize_recording_task(
    app: FastAPI,
    recording_id: int,
    channel_external_id: str,
    task: "asyncio.Task[Any]",
) -> None:
    db: Session = SessionLocal()
    try:
        try:
            result = await task
        except asyncio.CancelledError:
            recording = db.query(Recording).filter(Recording.id == recording_id).first()
            if recording:
                recording.status = "cancelled"
                recording.ended_at = utc_now()
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
                recording.ended_at = utc_now()
                recording.title = recording.title or str(exc)
                path_sink = app.state.recording_runtime.get(recording_id, {}).get("path_sink", [])
                if path_sink:
                    recording.file_path = path_sink[0]
                    try:
                        recording.file_size_bytes = os.path.getsize(path_sink[0])
                    except OSError:
                        recording.file_size_bytes = None
                db.commit()
            scanner = getattr(app.state, "scanner", None)
            if scanner:
                scanner.reset_live_state(channel_external_id)
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

        if not result.succeeded:
            scanner = getattr(app.state, "scanner", None)
            if scanner:
                scanner.reset_live_state(channel_external_id)

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

            from uploader import upload_to_drive
            upload_task = asyncio.create_task(
                upload_to_drive(
                    db_factory=SessionLocal,
                    upload_log_id=upload_log.id,
                    file_path=result.output_file,
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


async def start_recording_for_channel(
    app: FastAPI,
    channel_external_id: str,
    recordings_output_dir: str,
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

        from recorder import start_streamlink_recording
        from services.chzzk_client import extract_display_name, extract_stream_title, extract_thumbnail_url
        from services.cookie_service import get_global_cookie_map

        db: Session = SessionLocal()
        try:
            channel = resolve_channel_by_external_id(db, channel_external_id)
            if not channel.is_active:
                raise HTTPException(status_code=400, detail="Channel is inactive")

            stream_id = None
            title = stream_title or channel.name or channel.channel_id
            if isinstance(payload, dict):
                stream_id = payload.get("liveId") or payload.get("streamId")
                title = extract_stream_title(payload) or title
            resolved_display_name = (
                display_name or channel.name or extract_display_name(payload) or channel.channel_id
            )

            recording = Recording(
                channel_id=channel.id,
                stream_id=stream_id,
                title=title,
                file_path="",
                status="recording",
                started_at=utc_now(),
            )
            db.add(recording)
            db.commit()
            db.refresh(recording)

            cookies = get_global_cookie_map(db)
            stream_url = f"https://chzzk.naver.com/live/{channel.channel_id}"
            quality = normalize_quality(channel.quality)
            thumbnail_url = extract_thumbnail_url(payload)
        finally:
            db.close()

        path_sink: list = []
        task = await start_streamlink_recording(
            channel_id=channel_external_id,
            display_name=resolved_display_name,
            stream_title=title,
            stream_url=stream_url,
            output_dir=recordings_output_dir,
            quality=quality,
            cookies=cookies or None,
            _path_sink=path_sink,
        )
        app.state.recording_tasks[recording.id] = task
        app.state.active_channel_recordings[channel_external_id] = recording.id
        app.state.recording_runtime[recording.id] = {"thumbnail_url": thumbnail_url, "path_sink": path_sink}

        scanner = getattr(app.state, "scanner", None)
        if scanner:
            scanner.cache_thumbnail_url(channel_external_id, thumbnail_url)

        asyncio.create_task(finalize_recording_task(app, recording.id, channel_external_id, task))

        logger.info(
            "Recording started channel=%s recording_id=%s source=%s",
            channel_external_id,
            recording.id,
            source,
        )
        return {"message": "Recording started", "recording_id": recording.id}


async def on_channel_live(app: FastAPI, channel_id: str, payload: dict[str, Any], recordings_output_dir: str) -> None:
    from services.chzzk_client import extract_display_name, extract_stream_title
    detected_title = extract_stream_title(payload)
    logger.info("Scanner callback received channel=%s title=%s", channel_id, detected_title or "-")
    try:
        await start_recording_for_channel(
            app,
            channel_id,
            recordings_output_dir,
            payload=payload,
            stream_title=detected_title,
            display_name=extract_display_name(payload),
            source="scanner",
        )
    except HTTPException as exc:
        logger.warning("Scanner live callback ignored channel=%s detail=%s", channel_id, exc.detail)
    except Exception:
        logger.exception("Scanner live callback failed channel=%s", channel_id)
