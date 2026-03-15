from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models.hardware import HealthResponse
from routers import battery, display, led, metrics, profile, status

app = FastAPI(title="ROG Ally Server Control API")

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


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")
