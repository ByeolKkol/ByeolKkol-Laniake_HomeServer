from fastapi import APIRouter, Query

from models.hardware import MetricPoint, MetricsHistoryResponse
from services import metrics_store

router = APIRouter()

_VALID_MINUTES = (5, 10, 30, 60, 360, 1440)


@router.get("/metrics/history", response_model=MetricsHistoryResponse)
def get_metrics_history(
    minutes: int = Query(60, ge=5, le=1440),
) -> MetricsHistoryResponse:
    """지정된 기간의 메트릭 이력을 반환합니다."""
    clamped = min(_VALID_MINUTES, key=lambda x: abs(x - minutes))
    points = metrics_store.query_range(clamped)
    return MetricsHistoryResponse(
        minutes=clamped,
        points=[MetricPoint(**p) for p in points],
    )
