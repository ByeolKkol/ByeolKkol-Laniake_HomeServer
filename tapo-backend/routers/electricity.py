from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from db import get_conn
from models import (
    DeviceMonthlyUsage, ElectricityRate, ElectricityRatesUpdate, MonthlyUsage,
)

router = APIRouter(prefix="/electricity", tags=["electricity"])


def _calculate_cost(kwh: float, rates: list[dict]) -> int:
    """누진세 구간별 전기요금 계산."""
    tiers = sorted(rates, key=lambda r: (r["limit_kwh"] is None, r["limit_kwh"] or 0))
    base_won = tiers[0]["base_won"]
    total_cost = 0.0
    prev_limit = 0

    for tier in tiers:
        limit = tier["limit_kwh"]
        base_won = tier["base_won"]
        if limit is None or kwh <= limit:
            total_cost += (kwh - prev_limit) * tier["rate_won"]
            break
        else:
            total_cost += (limit - prev_limit) * tier["rate_won"]
            prev_limit = limit

    return int(base_won + total_cost)


@router.get("/rates", response_model=list[ElectricityRate])
def get_rates() -> list[ElectricityRate]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT tier, limit_kwh, base_won, rate_won FROM electricity_rates ORDER BY tier")
            return [ElectricityRate(**row) for row in cur.fetchall()]


@router.put("/rates", status_code=204)
def update_rates(body: ElectricityRatesUpdate) -> Response:
    if not body.rates:
        raise HTTPException(400, "최소 1개 구간 필요")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM electricity_rates")
            cur.executemany(
                "INSERT INTO electricity_rates (tier, limit_kwh, base_won, rate_won) "
                "VALUES (%s, %s, %s, %s)",
                [(r.tier, r.limit_kwh, r.base_won, r.rate_won) for r in body.rates],
            )
        conn.commit()
    return Response(status_code=204)


@router.get("/monthly", response_model=list[MonthlyUsage])
def get_monthly(months: int = 6) -> list[MonthlyUsage]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            # 하루 최대 today_energy_wh를 일별로 집계 → 월별 합산
            cur.execute("""
                SELECT
                    d.id   AS device_id,
                    d.name AS name,
                    TO_CHAR(r.day AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS month,
                    SUM(r.daily_max) / 1000.0 AS kwh
                FROM (
                    SELECT
                        device_id,
                        DATE_TRUNC('day', TO_TIMESTAMP(ts) AT TIME ZONE 'Asia/Seoul') AS day,
                        MAX(today_energy_wh) AS daily_max
                    FROM tapo_readings
                    WHERE today_energy_wh IS NOT NULL
                      AND ts >= EXTRACT(EPOCH FROM
                            (DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Seoul')
                             - INTERVAL '1 month' * (%s - 1)))
                    GROUP BY device_id, day
                ) r
                JOIN tapo_devices d ON d.id = r.device_id
                GROUP BY d.id, d.name, month
                ORDER BY month DESC, d.name
            """, (months,))
            rows = cur.fetchall()

            cur.execute("SELECT tier, limit_kwh, base_won, rate_won FROM electricity_rates ORDER BY tier")
            rates = [dict(r) for r in cur.fetchall()]

    # 월별로 묶기
    month_map: dict[str, dict] = {}
    for row in rows:
        m = row["month"]
        if m not in month_map:
            month_map[m] = {"month": m, "devices": [], "total_kwh": 0.0}
        kwh = float(row["kwh"] or 0)
        month_map[m]["devices"].append(DeviceMonthlyUsage(
            device_id=row["device_id"], name=row["name"], kwh=round(kwh, 2)
        ))
        month_map[m]["total_kwh"] += kwh

    result = []
    for m_data in month_map.values():
        total = m_data["total_kwh"]
        result.append(MonthlyUsage(
            month=m_data["month"],
            total_kwh=round(total, 2),
            estimated_won=_calculate_cost(total, rates) if rates else 0,
            devices=m_data["devices"],
        ))

    return sorted(result, key=lambda x: x.month, reverse=True)
