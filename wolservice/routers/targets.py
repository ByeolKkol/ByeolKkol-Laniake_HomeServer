from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from models.target import WolTarget, WolTargetCreate, WolTargetUpdate
from services import store

router = APIRouter(prefix="/targets")


@router.get("", response_model=list[WolTarget])
def list_targets() -> list[WolTarget]:
    return store.list_targets()


@router.post("", response_model=WolTarget, status_code=201)
def create_target(body: WolTargetCreate) -> WolTarget:
    return store.create_target(body)


@router.patch("/{target_id}", response_model=WolTarget)
def update_target(target_id: str, body: WolTargetUpdate) -> WolTarget:
    target = store.update_target(target_id, body)
    if target is None:
        raise HTTPException(status_code=404, detail="대상을 찾을 수 없습니다.")
    return target


@router.delete("/{target_id}", status_code=204, response_class=Response)
def delete_target(target_id: str) -> Response:
    if not store.delete_target(target_id):
        raise HTTPException(status_code=404, detail="대상을 찾을 수 없습니다.")
    return Response(status_code=204)
