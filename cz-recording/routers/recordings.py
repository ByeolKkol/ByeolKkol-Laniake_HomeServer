from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from database import SessionLocal, get_db
from models import Channel, Recording, UploadLog
from schemas.recording import RecordingStartRequest, RecordingUpdate
from serializers import serialize_recording
from services.chzzk_client import extract_display_name, extract_stream_title, fetch_chzzk_live_detail
from services.recording_service import start_recording_for_channel

router = APIRouter(prefix="/recordings", tags=["recordings"])


@router.get("")
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
            serialize_recording(
                recording,
                quality=quality,
                display_name=display_name,
                title=recording.title,
                upload_status=upload_status if upload_status else ("pending" if recording.file_path else None),
            )
            for recording, quality, display_name, recording_title, upload_status in rows
        ]
    }


@router.get("/active")
def list_active_recordings(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = (
        db.query(Recording, Channel.quality, Channel.channel_id, Channel.name)
        .outerjoin(Channel, Recording.channel_id == Channel.id)
        .filter(Recording.status.in_(["recording", "queued"]))
        .order_by(Recording.started_at.desc())
        .all()
    )
    items = []
    scanner = getattr(request.app.state, "scanner", None)
    for recording, quality, channel_external_id, channel_name in rows:
        runtime = request.app.state.recording_runtime.get(recording.id, {})
        thumbnail_url = runtime.get("thumbnail_url")
        if not thumbnail_url and scanner and channel_external_id:
            thumbnail_url = scanner.get_thumbnail_url(channel_external_id)

        serialized = serialize_recording(
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


@router.post("/start")
async def start_recording(
    request: Request,
    payload: RecordingStartRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    channel_id = payload.channel_id
    if not channel_id:
        channel = db.query(Channel).filter(Channel.is_active.is_(True)).order_by(Channel.id.asc()).first()
        if not channel:
            raise HTTPException(status_code=400, detail="No active channels configured")
        channel_id = channel.channel_id

    live_payload = await fetch_chzzk_live_detail(channel_id)
    recordings_output_dir = request.app.state.recordings_output_dir
    return await start_recording_for_channel(
        request.app,
        channel_id,
        recordings_output_dir,
        payload=live_payload,
        stream_title=extract_stream_title(live_payload),
        display_name=extract_display_name(live_payload),
        source="manual",
    )


@router.post("/{recording_id}/stop")
async def stop_recording(recording_id: int, request: Request) -> dict[str, Any]:
    task = request.app.state.recording_tasks.get(recording_id)
    if not task:
        raise HTTPException(status_code=404, detail="No active recording found with this ID")
    task.cancel()
    return {"message": "Recording stop requested", "recording_id": recording_id}


@router.patch("/{recording_id}")
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
    return {"item": serialize_recording(recording), "message": "Recording updated"}


@router.delete("/{recording_id}")
def delete_recording(recording_id: int, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    if recording_id in request.app.state.recording_tasks:
        raise HTTPException(status_code=409, detail="Cannot delete an active recording")

    file_deleted = False
    file_path = recording.file_path
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
            file_deleted = True
        except OSError as exc:
            logger.warning(
                "Failed deleting recording file recording_id=%s path=%s error=%s", recording_id, file_path, exc
            )

    db.query(UploadLog).filter(UploadLog.recording_id == recording_id).delete(synchronize_session=False)
    db.delete(recording)
    db.commit()

    request.app.state.recording_runtime.pop(recording_id, None)
    for channel_external_id, active_recording_id in list(request.app.state.active_channel_recordings.items()):
        if active_recording_id == recording_id:
            request.app.state.active_channel_recordings.pop(channel_external_id, None)

    return {"message": "Recording deleted", "file_deleted": file_deleted}


@router.post("/{recording_id}/retry-upload")
async def retry_recording_upload(
    recording_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from uploader import upload_to_drive
    from serializers import serialize_upload

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

    from services.recording_service import GOOGLE_DRIVE_PARENT_ID
    upload_task = asyncio.create_task(
        upload_to_drive(
            db_factory=SessionLocal,
            upload_log_id=upload_log.id,
            file_path=recording.file_path,
            parent_folder_id=GOOGLE_DRIVE_PARENT_ID,
        )
    )
    request.app.state.upload_tasks[upload_log.id] = upload_task
    upload_task.add_done_callback(lambda _: request.app.state.upload_tasks.pop(upload_log.id, None))

    return {"message": "Upload retry queued", "item": serialize_upload(upload_log)}
