from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile

from pydantic import BaseModel

from uploader import (
    GOOGLE_DRIVE_CREDENTIALS_FILE,
    GOOGLE_DRIVE_SESSION_FILE,
    complete_oauth,
    ensure_drive_settings_file,
    get_drive_connection_status,
    get_oauth_url,
)

router = APIRouter(prefix="/settings", tags=["settings"])

MAX_FILE_SIZE = 2 * 1024 * 1024


@router.get("/google-drive")
def get_google_drive_settings() -> dict[str, Any]:
    return {"item": get_drive_connection_status()}


@router.post("/google-drive")
async def upload_google_drive_credentials(credentials_file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await credentials_file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="credentials.json is empty")
    if len(raw) > MAX_FILE_SIZE:
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


@router.post("/google-drive/session")
async def upload_google_drive_session(session_file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await session_file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Session file is empty")
    if len(raw) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Session file is too large")

    try:
        parsed = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Session file must be valid UTF-8 JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Session file must be a JSON object")

    GOOGLE_DRIVE_SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    GOOGLE_DRIVE_SESSION_FILE.write_text(json.dumps(parsed, indent=2), encoding="utf-8")

    return {
        "message": "Google Drive session uploaded",
        "item": get_drive_connection_status(),
    }


@router.get("/google-drive/auth-url")
def get_google_drive_auth_url() -> dict[str, Any]:
    try:
        url = get_oauth_url()
        return {"auth_url": url}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class OAuthCodeRequest(BaseModel):
    code: str


@router.post("/google-drive/auth-code")
def submit_google_drive_auth_code(body: OAuthCodeRequest) -> dict[str, Any]:
    try:
        complete_oauth(body.code)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": "OAuth 인증 완료", "item": get_drive_connection_status()}
