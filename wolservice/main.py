from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import power, targets

app = FastAPI(title="WolService")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(targets.router)
app.include_router(power.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
