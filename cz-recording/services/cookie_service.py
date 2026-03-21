from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from crypto import decrypt
from database import query_global_cookies
from models import Cookie

logger = logging.getLogger(__name__)


def get_global_cookie_map(db: Session) -> dict[str, str]:
    rows = (
        query_global_cookies(db, Cookie)
        .filter(Cookie.is_active.is_(True), Cookie.cookie_name.in_(["NID_AUT", "NID_SES"]))
        .order_by(Cookie.updated_at.desc(), Cookie.id.desc())
        .all()
    )
    cookie_map: dict[str, str] = {}
    for row in rows:
        if row.cookie_name not in cookie_map:
            try:
                cookie_map[row.cookie_name] = decrypt(row.cookie_value)
            except ValueError:
                logger.error("쿠키 복호화 실패 id=%s, 건너뜁니다.", row.id)
    return cookie_map
