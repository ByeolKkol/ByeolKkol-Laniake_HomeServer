import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import get_conn, init_db
from routers import exercise, heartrate, metric, sleep, weight
from routers import webhook_hae
from xiaomi_poller import list_devices, poll_loop

logger = logging.getLogger(__name__)

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    task = asyncio.create_task(poll_loop(_save_weight))
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


def _save_weight(data: dict) -> None:
    """S800 측정 완료 콜백 — DB에 체중·체성분 저장."""
    from db import get_conn
    import time as _time
    ts = data.get("ts") or _time.time()
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO health_weight
                       (ts, weight_kg, bmi, body_fat_pct, muscle_kg, bone_kg,
                        visceral_fat, water_pct, bmr_kcal, source)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (
                        ts,
                        data["weight_kg"],
                        data.get("bmi"),
                        data.get("body_fat_pct"),
                        data.get("muscle_kg"),
                        data.get("bone_kg"),
                        data.get("visceral_fat"),
                        data.get("water_pct"),
                        data.get("bmr_kcal"),
                        "xiaomi_s800",
                    ),
                )
            conn.commit()
        logger.info("체중 저장 완료: %.2f kg", data["weight_kg"])
    except Exception as exc:
        logger.error("체중 저장 실패: %s", exc)


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
app.include_router(metric.router)
app.include_router(sleep.router)
app.include_router(webhook_hae.router)

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
