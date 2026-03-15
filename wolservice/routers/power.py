from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from models.target import PowerStatus
from services import ssh, status, store, wol

router = APIRouter(prefix="/power")


def _get_or_404(target_id: str):
    target = store.get_target(target_id)
    if target is None:
        raise HTTPException(status_code=404, detail="대상을 찾을 수 없습니다.")
    return target


@router.post("/wake/{target_id}", status_code=204, response_class=Response)
def wake(target_id: str) -> Response:
    """WOL 매직 패킷으로 PC 켜기."""
    target = _get_or_404(target_id)
    try:
        wol.send_magic_packet(target.mac, target.ip)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return Response(status_code=204)


@router.post("/shutdown/{target_id}", status_code=204, response_class=Response)
def shutdown(target_id: str) -> Response:
    """SSH로 PC 종료."""
    target = _get_or_404(target_id)
    if not (target.ip and target.ssh_user and target.ssh_password):
        raise HTTPException(status_code=400, detail="SSH 정보가 등록되지 않았습니다.")
    try:
        ssh.shutdown(target.ip, target.ssh_port, target.ssh_user, target.ssh_password, target.os_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return Response(status_code=204)


@router.post("/reboot/{target_id}", status_code=204, response_class=Response)
def reboot(target_id: str) -> Response:
    """SSH로 PC 재시작."""
    target = _get_or_404(target_id)
    if not (target.ip and target.ssh_user and target.ssh_password):
        raise HTTPException(status_code=400, detail="SSH 정보가 등록되지 않았습니다.")
    try:
        ssh.reboot(target.ip, target.ssh_port, target.ssh_user, target.ssh_password, target.os_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return Response(status_code=204)


@router.get("/status/{target_id}", response_model=PowerStatus)
def get_status(target_id: str) -> PowerStatus:
    """PC 온라인 여부 확인."""
    target = _get_or_404(target_id)
    if not target.ip:
        return PowerStatus(id=target_id, online=None)
    online = status.check_online(target.ip, target.ssh_port if target.ssh_user else None)
    return PowerStatus(id=target_id, online=online)
