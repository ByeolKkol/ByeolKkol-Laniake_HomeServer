from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from crypto import encrypt
from database import get_db, query_global_cookies
from models import Cookie
from schemas.cookie import CookieUpdate
from serializers import mask_cookie
from services.cookie_service import get_global_cookie_map

router = APIRouter(prefix="/cookies", tags=["cookies"])


@router.get("")
def list_cookies(db: Session = Depends(get_db)) -> dict[str, Any]:
    cookie_map = get_global_cookie_map(db)
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
            "nid_aut_masked": mask_cookie(cookie_map["NID_AUT"]) if cookie_map.get("NID_AUT") else None,
            "nid_ses_masked": mask_cookie(cookie_map["NID_SES"]) if cookie_map.get("NID_SES") else None,
            "updated_at": latest_updated_at,
        }
    }


@router.put("")
def upsert_cookies(payload: CookieUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    new_values = {"NID_AUT": payload.nid_aut, "NID_SES": payload.nid_ses}
    for cookie_name, cookie_value in new_values.items():
        encrypted_value = encrypt(cookie_value)
        row = (
            query_global_cookies(db, Cookie)
            .filter(Cookie.cookie_name == cookie_name)
            .order_by(Cookie.updated_at.desc(), Cookie.id.desc())
            .first()
        )
        if row:
            row.cookie_value = encrypted_value
            row.is_active = True
        else:
            db.add(
                Cookie(
                    channel_id=None,
                    cookie_name=cookie_name,
                    cookie_value=encrypted_value,
                    is_active=True,
                )
            )
    db.commit()
    return {"message": "Global cookies saved"}
