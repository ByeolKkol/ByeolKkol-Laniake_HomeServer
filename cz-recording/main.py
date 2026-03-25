import asyncio
import logging
import os
import shutil
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, SessionLocal, engine, get_db
from models import Recording
from routers import channels, cookies, proxy, recordings, settings, uploads
from scanner import ChzzkScanner
from serializers import utc_now
from services.recording_service import on_channel_live, set_google_drive_parent_id

logger = logging.getLogger(__name__)

RECORDINGS_OUTPUT_DIR = os.getenv("RECORDINGS_OUTPUT_DIR", "./recordings")
GOOGLE_DRIVE_PARENT_ID = os.getenv("GOOGLE_DRIVE_PARENT_ID")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    app.state.recordings_output_dir = RECORDINGS_OUTPUT_DIR
    app.state.recording_tasks = {}
    app.state.active_channel_recordings = {}
    app.state.recording_runtime = {}
    app.state.upload_tasks = {}
    app.state.recording_lock = asyncio.Lock()

    set_google_drive_parent_id(GOOGLE_DRIVE_PARENT_ID)

    # 서버 재시작 시 orphan 상태 레코드 자동 정리
    _startup_db = SessionLocal()
    try:
        stale = _startup_db.query(Recording).filter(Recording.status.in_(["recording", "queued"])).all()
        for r in stale:
            r.status = "cancelled"
            r.ended_at = utc_now()
        if stale:
            _startup_db.commit()
            logger.info("Startup: marked %d stale recording(s) as cancelled", len(stale))
    finally:
        _startup_db.close()

    scanner = ChzzkScanner(
        db_factory=SessionLocal,
        on_live=lambda channel_id, payload: on_channel_live(app, channel_id, payload, RECORDINGS_OUTPUT_DIR),
    )
    app.state.scanner = scanner
    scanner.start()
    await scanner.scan_once()

    try:
        yield
    finally:
        scanner.shutdown()
        tasks = list(app.state.recording_tasks.values()) + list(app.state.upload_tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


_ORIGINS_RAW = os.getenv("CORS_ALLOWED_ORIGINS", "")
_CORS_ORIGINS = [o.strip() for o in _ORIGINS_RAW.split(",") if o.strip()] or ["*"]

app = FastAPI(title="CHZZK Recorder API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(channels.router)
app.include_router(cookies.router)
app.include_router(recordings.router)
app.include_router(uploads.router)
app.include_router(proxy.router)
app.include_router(settings.router)


@app.get("/")
def root() -> dict[str, Any]:
    return {"service": "chzzk-recorder", "status": "ok"}


@app.get("/health")
def health_check() -> dict[str, Any]:
    try:
        disk = shutil.disk_usage(RECORDINGS_OUTPUT_DIR)
        disk_info = {
            "disk_free_bytes": disk.free,
            "disk_total_bytes": disk.total,
            "disk_used_percent": round(disk.used / disk.total * 100, 1),
        }
    except Exception:
        disk_info = {"disk_free_bytes": None, "disk_total_bytes": None, "disk_used_percent": None}
    return {
        "healthy": True,
        "scanner_running": bool(getattr(app.state.scanner, "_started", False)),
        "active_recordings": len(app.state.active_channel_recordings),
        **disk_info,
    }
