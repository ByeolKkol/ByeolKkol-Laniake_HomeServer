from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Channel
from schemas.channel import ChannelCreate, ChannelUpdate
from serializers import serialize_channel
from services.recording_service import normalize_quality, resolve_channel_by_external_id

router = APIRouter(prefix="/channels", tags=["channels"])


@router.get("")
def list_channels(db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.query(Channel).order_by(Channel.id.desc()).all()
    return {"items": [serialize_channel(row) for row in rows]}


@router.post("")
def create_channel(payload: ChannelCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    from fastapi import HTTPException
    existing = db.query(Channel).filter(Channel.channel_id == payload.channel_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Channel already exists")

    channel = Channel(
        channel_id=payload.channel_id,
        name=payload.name or payload.channel_id,
        quality=normalize_quality(payload.quality),
        is_active=payload.is_active,
    )
    db.add(channel)
    db.commit()
    db.refresh(channel)
    return {"item": serialize_channel(channel), "message": "Channel created"}


@router.patch("/{channel_id}")
def update_channel(channel_id: str, payload: ChannelUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    channel = resolve_channel_by_external_id(db, channel_id)
    if payload.name is not None:
        channel.name = payload.name
    if payload.quality is not None:
        channel.quality = normalize_quality(payload.quality)
    if payload.is_active is not None:
        channel.is_active = payload.is_active
    db.commit()
    db.refresh(channel)
    return {"item": serialize_channel(channel), "message": "Channel updated"}


@router.delete("/{channel_id}")
def delete_channel(channel_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    channel = resolve_channel_by_external_id(db, channel_id)
    db.delete(channel)
    db.commit()
    return {"message": "Channel deleted"}
