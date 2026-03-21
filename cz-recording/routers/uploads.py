from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from database import get_db
from models import Recording, UploadLog
from schemas.upload import UploadCreate
from serializers import serialize_upload

router = APIRouter(tags=["uploads"])


@router.delete("/upload/{upload_log_id}")
def delete_upload_log(upload_log_id: int, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    log = db.query(UploadLog).filter(UploadLog.id == upload_log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Upload log not found")
    if upload_log_id in request.app.state.upload_tasks:
        raise HTTPException(status_code=409, detail="Cannot delete an active upload")
    db.delete(log)
    db.commit()
    return {"message": "Upload log deleted"}


@router.post("/upload")
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


@router.get("/upload/status")
def get_upload_status(
    request: Request,
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    query = db.query(UploadLog)
    if status:
        query = query.filter(UploadLog.status == status)
    rows = query.order_by(UploadLog.id.desc()).limit(limit).all()
    return {
        "items": [serialize_upload(row) for row in rows],
        "active_uploads": len(request.app.state.upload_tasks),
    }
