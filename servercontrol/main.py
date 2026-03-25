import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models.hardware import HealthResponse
from routers import battery, display, history, led, metrics, profile, status
from services import metrics_store, sysinfo
from services.sysfs import read_cpu_temp

logger = logging.getLogger(__name__)

# 네트워크 속도 계산용 이전 값 추적
_prev_net_ts: float = 0.0
_prev_net_recv: int = 0
_prev_net_sent: int = 0


async def _collect_loop() -> None:
    """10초마다 메트릭을 수집하여 DB에 저장합니다."""
    global _prev_net_ts, _prev_net_recv, _prev_net_sent

    while True:
        await asyncio.sleep(metrics_store.COLLECT_INTERVAL_S)
        try:
            cpu  = sysinfo.read_cpu_usage()
            mem  = sysinfo.read_memory()["percent"]
            temp = read_cpu_temp()
            net  = sysinfo.read_network()
            now  = time.time()

            net_recv_bps: float | None = None
            net_sent_bps: float | None = None
            if _prev_net_ts > 0:
                dt = now - _prev_net_ts
                if dt > 0:
                    net_recv_bps = max(0.0, (net["bytes_recv"] - _prev_net_recv) / dt)
                    net_sent_bps = max(0.0, (net["bytes_sent"] - _prev_net_sent) / dt)

            _prev_net_ts   = now
            _prev_net_recv = net["bytes_recv"]
            _prev_net_sent = net["bytes_sent"]

            metrics_store.insert_sample(cpu, mem, temp, net_recv_bps, net_sent_bps)
        except Exception:
            logger.exception("Metrics collect error")


async def _cleanup_loop() -> None:
    """1시간마다 24시간 초과 데이터를 삭제합니다."""
    while True:
        await asyncio.sleep(3600)
        try:
            metrics_store.cleanup_old()
        except Exception:
            logger.exception("Cleanup loop error")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    metrics_store.init_db()
    collect_task = asyncio.create_task(_collect_loop())
    cleanup_task = asyncio.create_task(_cleanup_loop())
    yield
    collect_task.cancel()
    cleanup_task.cancel()
    for task in (collect_task, cleanup_task):
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="ROG Ally Server Control API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)

app.include_router(status.router)
app.include_router(battery.router)
app.include_router(profile.router)
app.include_router(led.router)
app.include_router(display.router)
app.include_router(metrics.router)
app.include_router(history.router)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")
