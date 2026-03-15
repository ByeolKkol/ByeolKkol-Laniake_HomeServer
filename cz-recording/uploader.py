import asyncio
import json
import logging
import mimetypes
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydrive2.auth import GoogleAuth
from pydrive2.drive import GoogleDrive

from models import UploadLog

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
GOOGLE_DRIVE_CREDENTIALS_FILE = Path(
    os.getenv("GOOGLE_DRIVE_CREDENTIALS_FILE", str(BASE_DIR / "credentials.json"))
)
GOOGLE_DRIVE_SETTINGS_FILE = Path(
    os.getenv("GOOGLE_DRIVE_SETTINGS_FILE", str(BASE_DIR / "settings.yaml"))
)
GOOGLE_DRIVE_SESSION_FILE = Path(
    os.getenv("GOOGLE_DRIVE_SESSION_FILE", str(BASE_DIR / "google_drive_session.json"))
)


def _utc_now() -> datetime:
    return datetime.now(tz=UTC)


def _ensure_settings_file() -> None:
    if GOOGLE_DRIVE_SETTINGS_FILE.exists():
        return

    GOOGLE_DRIVE_SETTINGS_FILE.write_text(
        "\n".join(
            [
                "client_config_backend: file",
                f"client_config_file: '{GOOGLE_DRIVE_CREDENTIALS_FILE}'",
                "save_credentials: true",
                "save_credentials_backend: file",
                f"save_credentials_file: '{GOOGLE_DRIVE_SESSION_FILE}'",
                "get_refresh_token: true",
                "oauth_scope:",
                "  - https://www.googleapis.com/auth/drive",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def ensure_drive_settings_file() -> None:
    _ensure_settings_file()


def _detect_credential_type() -> str:
    if not GOOGLE_DRIVE_CREDENTIALS_FILE.exists():
        return "missing"

    try:
        parsed = json.loads(GOOGLE_DRIVE_CREDENTIALS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return "invalid"

    if isinstance(parsed, dict) and parsed.get("type") == "service_account":
        return "service_account"
    if isinstance(parsed, dict) and (parsed.get("installed") or parsed.get("web")):
        return "oauth_client"
    return "unknown"


def get_drive_connection_status() -> dict[str, Any]:
    credential_type = _detect_credential_type()
    has_credentials = GOOGLE_DRIVE_CREDENTIALS_FILE.exists()
    has_settings = GOOGLE_DRIVE_SETTINGS_FILE.exists()
    has_session = GOOGLE_DRIVE_SESSION_FILE.exists()

    connected = False
    detail = "Google Drive is not configured"

    if credential_type == "service_account" and has_credentials:
        connected = True
        detail = "Service account credentials detected"
    elif credential_type == "oauth_client" and has_credentials and has_settings and has_session:
        connected = True
        detail = "OAuth credentials and saved session detected"
    elif credential_type == "oauth_client" and has_credentials:
        detail = "credentials.json is uploaded. Complete one-time OAuth auth on the server."
    elif credential_type == "invalid":
        detail = "credentials.json is invalid JSON"

    return {
        "connected": connected,
        "credentials_exists": has_credentials,
        "settings_exists": has_settings,
        "session_exists": has_session,
        "credential_type": credential_type,
        "credentials_path": str(GOOGLE_DRIVE_CREDENTIALS_FILE),
        "settings_path": str(GOOGLE_DRIVE_SETTINGS_FILE),
        "session_path": str(GOOGLE_DRIVE_SESSION_FILE),
        "detail": detail,
    }


def _build_drive() -> GoogleDrive:
    if not GOOGLE_DRIVE_CREDENTIALS_FILE.exists():
        raise RuntimeError("Google Drive credentials.json not found")

    credential_type = _detect_credential_type()

    if credential_type == "service_account":
        gauth = GoogleAuth()
        gauth.settings["client_config_backend"] = "service"
        gauth.settings["service_config"] = {
            "client_json_file_path": str(GOOGLE_DRIVE_CREDENTIALS_FILE),
        }
        gauth.settings["oauth_scope"] = ["https://www.googleapis.com/auth/drive"]
        gauth.ServiceAuth()
        return GoogleDrive(gauth)

    _ensure_settings_file()

    gauth = GoogleAuth(settings_file=str(GOOGLE_DRIVE_SETTINGS_FILE))
    try:
        gauth.LoadCredentialsFile(str(GOOGLE_DRIVE_SESSION_FILE))
    except Exception:
        logger.warning("Failed loading cached Google Drive session", exc_info=True)

    if gauth.credentials is None:
        raise RuntimeError(
            "Google Drive OAuth session missing. Run one-time auth on server to create session credentials."
        )
    if gauth.access_token_expired:
        gauth.Refresh()
    else:
        gauth.Authorize()

    gauth.SaveCredentialsFile(str(GOOGLE_DRIVE_SESSION_FILE))
    return GoogleDrive(gauth)


def _upload_sync(file_path: str, parent_folder_id: str | None = None) -> dict[str, Any]:
    drive = _build_drive()
    file_name = Path(file_path).name

    metadata: dict[str, Any] = {"title": file_name}
    if parent_folder_id:
        metadata["parents"] = [{"id": parent_folder_id}]

    drive_file = drive.CreateFile(metadata)
    mime_type, _ = mimetypes.guess_type(file_path)
    drive_file.SetContentFile(file_path)
    # pydrive2 usually handles mimetype automatically, or you can set it via metadata
    drive_file.Upload(param={"supportsAllDrives": True})

    file_id = drive_file.get("id")
    file_url = drive_file.get("webViewLink")
    if not file_url and file_id:
        file_url = f"https://drive.google.com/file/d/{file_id}/view"

    remote_size = drive_file.get("fileSize")
    uploaded_size = int(remote_size) if remote_size else os.path.getsize(file_path)

    return {
        "file_id": file_id,
        "file_url": file_url,
        "uploaded_size": uploaded_size,
    }


async def upload_to_drive(
    *,
    db_factory: Any,
    upload_log_id: int,
    file_path: str,
    runtime_status: dict[int, dict[str, Any]],
    parent_folder_id: str | None = None,
) -> None:
    db = db_factory()
    try:
        log = db.query(UploadLog).filter(UploadLog.id == upload_log_id).first()
        if not log:
            return

        if not os.path.exists(file_path):
            log.status = "failed"
            log.message = f"File not found: {file_path}"
            db.commit()
            runtime_status[upload_log_id] = {
                "upload_log_id": upload_log_id,
                "recording_id": log.recording_id,
                "status": log.status,
                "message": log.message,
                "progress_percent": 0,
                "updated_at": _utc_now(),
            }
            return

        file_size = os.path.getsize(file_path)
        log.status = "uploading"
        log.started_at = _utc_now()
        log.progress_percent = 0
        log.bytes_uploaded = 0
        log.bytes_total = file_size
        log.message = "Uploading to Google Drive"
        db.commit()

        runtime_status[upload_log_id] = {
            "upload_log_id": upload_log_id,
            "recording_id": log.recording_id,
            "status": "uploading",
            "message": log.message,
            "progress_percent": 0,
            "bytes_uploaded": 0,
            "bytes_total": file_size,
            "updated_at": _utc_now(),
        }

        result = await asyncio.to_thread(_upload_sync, file_path, parent_folder_id)

        log.status = "completed"
        log.progress_percent = 100
        log.bytes_uploaded = result["uploaded_size"]
        log.bytes_total = file_size
        log.drive_file_id = result.get("file_id")
        log.drive_file_url = result.get("file_url")
        log.uploaded_at = _utc_now()
        log.message = "Uploaded to Google Drive"
        db.commit()

        # [PRO] 업로드 성공 후 로컬 파일 삭제 (서버 용량 관리)
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Local file removed after successful upload: {file_path}")
        except Exception as e:
            logger.error(f"Failed to remove local file: {file_path}, error: {e}")

        runtime_status[upload_log_id] = {
            "upload_log_id": upload_log_id,
            "recording_id": log.recording_id,
            "status": log.status,
            "message": log.message,
            "progress_percent": 100,
            "bytes_uploaded": log.bytes_uploaded,
            "bytes_total": log.bytes_total,
            "drive_file_id": log.drive_file_id,
            "drive_file_url": log.drive_file_url,
            "updated_at": _utc_now(),
        }
    except Exception as exc:
        logger.exception("Upload task crashed upload_log_id=%s", upload_log_id)
        try:
            log = db.query(UploadLog).filter(UploadLog.id == upload_log_id).first()
            if log:
                log.status = "failed"
                log.message = str(exc)[-2000:] or "Upload task crashed unexpectedly"
                db.commit()

                runtime_status[upload_log_id] = {
                    "upload_log_id": upload_log_id,
                    "recording_id": log.recording_id,
                    "status": log.status,
                    "message": log.message,
                    "progress_percent": log.progress_percent,
                    "bytes_uploaded": log.bytes_uploaded,
                    "bytes_total": log.bytes_total,
                    "updated_at": _utc_now(),
                }
        except Exception:
            logger.exception("Failed to persist upload crash status upload_log_id=%s", upload_log_id)
    finally:
        db.close()
