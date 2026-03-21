import asyncio
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import cleanup_old, init_db
from routers import devices, readings


async def _cleanup_loop() -> None:
    while True:
        await asyncio.sleep(3600)
        try:
            cleanup_old()
        except Exception:
            pass


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    task = asyncio.create_task(_cleanup_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


_ORIGINS_RAW = os.getenv("CORS_ALLOWED_ORIGINS", "")
_CORS_ORIGINS = [o.strip() for o in _ORIGINS_RAW.split(",") if o.strip()] or ["*"]

app = FastAPI(title="IoT Sensor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)

app.include_router(devices.router)
app.include_router(readings.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
