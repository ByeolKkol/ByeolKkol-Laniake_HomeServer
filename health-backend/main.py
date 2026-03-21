import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import get_conn, init_db
from routers import exercise, heartrate, weight
from xiaomi_poller import list_devices, poll_loop

logger = logging.getLogger(__name__)

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    task = asyncio.create_task(poll_loop(_noop_save))
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


def _noop_save(data: dict) -> None:
    """Xiaomi 폴러 콜백 — S800 도착 후 실제 저장 로직으로 교체."""
    logger.info("Xiaomi data received (not yet parsed): %s", data)


_ORIGINS_RAW = os.getenv("CORS_ALLOWED_ORIGINS", "")
_CORS_ORIGINS = [o.strip() for o in _ORIGINS_RAW.split(",") if o.strip()] or ["*"]

app = FastAPI(title="Health Backend API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)

app.include_router(weight.router)
app.include_router(heartrate.router)
app.include_router(exercise.router)

# Xiaomi 기기 목록 확인용 (device_id 조회)
_util_router = APIRouter(prefix="/weight/xiaomi", tags=["xiaomi"])


@_util_router.get("/devices")
def xiaomi_devices() -> list[dict[str, Any]]:
    """Xiaomi 클라우드 기기 목록 (XIAOMI_DEVICE_ID 설정 전 확인용)."""
    return list_devices()


app.include_router(_util_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
