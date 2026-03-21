from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

from db import get_conn
import tapo_poller

router = APIRouter(prefix="/settings", tags=["settings"])


class TapoCredentials(BaseModel):
    username: str
    password: str


class TapoCredentialsResponse(BaseModel):
    username: str
    has_password: bool


@router.get("/tapo", response_model=TapoCredentialsResponse)
def get_tapo_settings() -> TapoCredentialsResponse:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT key, value FROM app_settings "
                "WHERE key IN ('tapo_username', 'tapo_password')"
            )
            rows = {r["key"]: r["value"] for r in cur.fetchall()}
    return TapoCredentialsResponse(
        username=rows.get("tapo_username", ""),
        has_password=bool(rows.get("tapo_password")),
    )


@router.put("/tapo", status_code=204)
def update_tapo_settings(body: TapoCredentials) -> Response:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO app_settings (key, value) VALUES ('tapo_username', %s)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """, (body.username,))
            cur.execute("""
                INSERT INTO app_settings (key, value) VALUES ('tapo_password', %s)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """, (body.password,))
        conn.commit()
    # 자격증명 변경 시 클라우드 세션 초기화
    tapo_poller._cloud = None
    return Response(status_code=204)
