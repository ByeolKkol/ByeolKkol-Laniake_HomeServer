"""BIA(생체전기저항) 기반 체성분 계산 (남성 전용, Xiaomi S800 MJTZC04YM).

캘리브레이션:
    wiecosystem 공식은 BMI>25 범위에서 체지방을 과소평가하는 경향이 있음.
    실측 데이터 2포인트에서 보정 계수 k=1.23 도출:
        fat_pct += 1.23 × max(0, BMI - 25)

파생 지표 비율 (Mi 앱 실측 기반):
    bone  = LBM × 5.49%
    water = LBM × 73.81%
"""
from __future__ import annotations

from datetime import date

_OBESITY_K = 1.23        # BMI 25 초과 1단위당 체지방률 보정값
_BONE_FRAC = 0.0549      # bone / LBM
_WATER_FRAC = 0.7381     # body water / LBM


def calculate_age(dob_str: str) -> int:
    """생년월일(YYYY-MM-DD)로 현재 나이 계산."""
    dob = date.fromisoformat(dob_str)
    today = date.today()
    age = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        age -= 1
    return age


def calculate(
    weight_kg: float,
    height_cm: float,
    age: int,
    impedance: float,
) -> dict[str, float | int]:
    """체성분 계산 (남성).

    Args:
        weight_kg:  체중 (kg)
        height_cm:  키 (cm)
        age:        나이
        impedance:  임피던스 (Ω) — phase 0x45 raw / 100

    Returns:
        bmi, body_fat_pct, muscle_kg, bone_kg, bmr_kcal, water_pct, visceral_fat
    """
    bmi = weight_kg / (height_cm / 100) ** 2

    # ── Step 1: wiecosystem LBM 추정 ──────────────────────────────────────
    raw_lbm = (height_cm * 9.058 / 100) * (height_cm / 100)
    raw_lbm += weight_kg * 0.32 + 12.226
    raw_lbm -= impedance * 0.0068
    raw_lbm -= age * 0.0542

    # ── Step 2: 기본 체지방률 ──────────────────────────────────────────────
    coeff = 0.98 if weight_kg < 61 else 1.0
    raw_fat_pct = (1.0 - (raw_lbm - 0.8) * coeff / weight_kg) * 100

    # ── Step 3: BMI 비만 보정 ─────────────────────────────────────────────
    # wiecosystem 공식은 BMI>25에서 체지방을 과소평가함 (DEXA 비교 연구 및
    # Mi 앱 실측 2포인트로 검증된 k=1.23)
    bmi_correction = _OBESITY_K * max(0.0, bmi - 25.0)
    fat_pct = max(5.0, min(75.0, raw_fat_pct + bmi_correction))

    # ── Step 4: 보정된 LBM 및 파생 지표 ──────────────────────────────────
    fat_kg = weight_kg * fat_pct / 100
    lbm = weight_kg - fat_kg

    bone_kg = lbm * _BONE_FRAC
    muscle_kg = lbm - bone_kg
    water_pct = (lbm * _WATER_FRAC / weight_kg) * 100

    # 기초대사량 Mifflin-St Jeor (남성)
    bmr = int(10 * weight_kg + 6.25 * height_cm - 5 * age + 5)

    # 내장지방 지수
    visceral_fat = int(max(1, min(59, (fat_kg - muscle_kg * 0.15) * 0.12)))

    return {
        "bmi": round(bmi, 1),
        "body_fat_pct": round(fat_pct, 1),
        "muscle_kg": round(muscle_kg, 1),
        "bone_kg": round(bone_kg, 1),
        "bmr_kcal": bmr,
        "water_pct": round(water_pct, 1),
        "visceral_fat": visceral_fat,
    }
