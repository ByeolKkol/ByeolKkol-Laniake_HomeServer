import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import cleanup_old, init_db
from routers import devices, electricity, history, tapo_settings
from tapo_poller import poll_loop

logger = logging.getLogger(__name__)


async def _cleanup_loop() -> None:
    while True:
        await asyncio.sleep(3600)
        try:
            cleanup_old()
        except Exception:
            logger.exception("Cleanup loop error")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    tasks = [
        asyncio.create_task(_cleanup_loop()),
        asyncio.create_task(poll_loop()),
    ]
    yield
    for task in tasks:
        task.cancel()
    for task in tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass


_ORIGINS_RAW = os.getenv("CORS_ALLOWED_ORIGINS", "")
_CORS_ORIGINS = [o.strip() for o in _ORIGINS_RAW.split(",") if o.strip()] or ["*"]

app = FastAPI(title="Tapo Smart Plug API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)

app.include_router(devices.router)
app.include_router(history.router)
app.include_router(electricity.router)
app.include_router(tapo_settings.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
