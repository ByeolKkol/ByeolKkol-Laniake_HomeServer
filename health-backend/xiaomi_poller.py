"""Xiaomi S800 (MJTZC04YM) BLE 폴러.

BLE 광고 패킷을 수동 스캔해 체중·임피던스 데이터를 복호화하고 체성분을 계산합니다.
클라우드 계정·앱 없이 동작합니다.

환경변수:
    SCALE_MAC       - S800 BLE MAC (기본: D4:43:8A:E4:3F:A2)
    SCALE_BINDKEY   - AES-CCM 복호화 키 32자리 hex
    SCALE_USER_HEIGHT_CM - 키 (기본: 175)
    SCALE_USER_DOB       - 생년월일 YYYY-MM-DD (기본: 1985-08-10)
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Callable

from body_composition import calculate, calculate_age

logger = logging.getLogger(__name__)

_SCALE_MAC = os.getenv("SCALE_MAC", "D4:43:8A:E4:3F:A2").upper()
_BINDKEY_HEX = os.getenv("SCALE_BINDKEY", "e5a6a2d894af716e62115d8aec95786d")
_HEIGHT_CM = float(os.getenv("SCALE_USER_HEIGHT_CM", "175"))
_DOB = os.getenv("SCALE_USER_DOB", "1985-08-10")

# phase 0x45 임피던스를 1차 BIA 값으로 사용
_PRIMARY_IMPEDANCE_PHASE = 0x45

_SESSION_TIMEOUT = 60.0  # 세션 최대 대기 시간(초)


def _is_configured() -> bool:
    return bool(_BINDKEY_HEX)


def _make_cipher():
    from cryptography.hazmat.primitives.ciphers.aead import AESCCM
    return AESCCM(bytes.fromhex(_BINDKEY_HEX), tag_length=4)


def _decrypt(data: bytes, cipher, source_mac_bytes: bytes) -> bytes | None:
    frctrl = data[0] + (data[1] << 8)
    has_mac   = (frctrl >> 4) & 1
    has_cap   = (frctrl >> 5) & 1
    has_obj   = (frctrl >> 6) & 1
    encrypted = (frctrl >> 3) & 1
    if not encrypted or not has_obj:
        return None
    mac = data[5:11] if has_mac else source_mac_bytes
    i = 5 + (6 if has_mac else 0) + (1 if has_cap else 0)
    nonce = mac[::-1] + data[2:5] + data[-7:-4]
    try:
        return cipher.decrypt(nonce, data[i:-7] + data[-4:], b"\x11")
    except Exception:
        return None


def _parse_packet(plain: bytes) -> dict | None:
    """복호화된 12바이트 페이로드 파싱."""
    if len(plain) < 12:
        return None
    phase = plain[6]
    if phase == 0x05:
        weight_raw = int.from_bytes(plain[10:12], "little")
        if weight_raw == 0:
            return None
        return {"type": "weight", "weight_kg": weight_raw / 100}
    if phase in (0x15, 0x25, 0x35, 0x45, 0x55):
        imp_raw = int.from_bytes(plain[4:6], "little")
        return {"type": "impedance", "phase": phase, "raw": imp_raw}
    return None


async def poll_loop(save_fn: Callable[[dict], None]) -> None:
    """BLE 광고 스캔 루프. 측정 완료 시 save_fn(data) 호출.

    data 키:
        ts, weight_kg, bmi, body_fat_pct, muscle_kg,
        bone_kg, visceral_fat, water_pct, bmr_kcal
    """
    if not _is_configured():
        logger.info("SCALE_BINDKEY 미설정 — BLE 폴러 비활성화")
        return

    try:
        from bleak import BleakScanner
    except ImportError:
        logger.error("bleak 미설치 — pip install bleak")
        return

    cipher = _make_cipher()
    source_mac = bytes.fromhex(_SCALE_MAC.replace(":", ""))

    session: dict = {}  # {phase: value}
    session_start: float = 0.0

    def detection_callback(device, adv):
        nonlocal session, session_start
        if device.address.upper() != _SCALE_MAC:
            return
        for _, data in adv.service_data.items():
            if len(data) < 16:
                continue
            plain = _decrypt(data, cipher, source_mac)
            if not plain:
                continue
            parsed = _parse_packet(plain)
            if not parsed:
                continue

            now = time.time()

            if parsed["type"] == "weight":
                # 새 세션 시작
                session = {"weight_kg": parsed["weight_kg"]}
                session_start = now
                logger.info("S800 체중 수신: %.2f kg", parsed["weight_kg"])

            elif parsed["type"] == "impedance" and session:
                if now - session_start > _SESSION_TIMEOUT:
                    session = {}
                    return
                session[f"phase_{parsed['phase']:02x}"] = parsed["raw"]

                # 모든 임피던스 수집 완료(5개) → 체성분 계산
                if all(f"phase_{p:02x}" in session for p in (0x15, 0x25, 0x35, 0x45, 0x55)):
                    _finish_session(session, save_fn)
                    session = {}

    logger.info("S800 BLE 스캔 시작 (MAC=%s)", _SCALE_MAC)
    async with BleakScanner(detection_callback=detection_callback):
        while True:
            await asyncio.sleep(10)
            # 세션 타임아웃 체크: 일부만 수신된 경우 weight만이라도 저장
            if session and time.time() - session_start > _SESSION_TIMEOUT:
                logger.warning("세션 타임아웃 — 체중만 저장")
                _finish_session(session, save_fn)
                session = {}


def _finish_session(session: dict, save_fn: Callable[[dict], None]) -> None:
    weight_kg = session.get("weight_kg")
    if not weight_kg:
        return

    # 모든 phase 원시값 로그 출력 (공식 캘리브레이션용)
    for phase in (0x15, 0x25, 0x35, 0x45, 0x55):
        raw = session.get(f"phase_{phase:02x}")
        if raw is not None:
            logger.info(
                "S800 impedance phase=0x%02x  raw=%d  (/10=%.1f)  (/100=%.2f)",
                phase, raw, raw / 10, raw / 100,
            )

    imp_raw = session.get(f"phase_{_PRIMARY_IMPEDANCE_PHASE:02x}")
    impedance = imp_raw / 100 if imp_raw else None  # 단위: 0.01Ω → Ω

    data: dict = {"ts": time.time(), "weight_kg": weight_kg}

    if impedance:
        age = calculate_age(_DOB)
        try:
            comp = calculate(weight_kg, _HEIGHT_CM, age, impedance)
            data.update(comp)
            logger.info(
                "체성분 계산 완료: 체중=%.2fkg  imp_raw=%d  imp=%.1fΩ  체지방=%.1f%%  근육=%.1fkg  BMR=%dkcal",
                weight_kg, imp_raw, impedance, comp["body_fat_pct"], comp["muscle_kg"], comp["bmr_kcal"],
            )
        except Exception as exc:
            logger.warning("체성분 계산 오류: %s", exc)

    save_fn(data)


def list_devices() -> list[dict]:
    """호환성 유지용 — 빈 목록 반환."""
    return []
