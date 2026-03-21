from datetime import UTC, datetime
from typing import Any

from models import Channel, Recording, UploadLog


def utc_now() -> datetime:
    return datetime.now(tz=UTC)


def serialize_channel(channel: Channel) -> dict[str, Any]:
    return {
        "id": channel.id,
        "channel_id": channel.channel_id,
        "name": channel.name,
        "quality": channel.quality,
        "is_active": channel.is_active,
        "created_at": channel.created_at,
        "updated_at": channel.updated_at,
    }


def serialize_recording(
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


def serialize_upload(upload: UploadLog) -> dict[str, Any]:
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


def mask_cookie(value: str) -> str:
    if len(value) < 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"
