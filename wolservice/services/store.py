from __future__ import annotations

import json
import os
import tempfile
import uuid
from pathlib import Path

from crypto import decrypt, encrypt
from models.target import WolTarget, WolTargetCreate, WolTargetUpdate

_DATA_FILE = Path("/app/data/wol_targets.json")


import logging as _logging

_logger = _logging.getLogger(__name__)


def _decrypt_target(data: dict) -> dict:
    if data.get("ssh_password"):
        try:
            data["ssh_password"] = decrypt(data["ssh_password"])
        except ValueError:
            _logger.error("ssh_password 복호화 실패 (target id=%s), 필드를 비웁니다.", data.get("id"))
            data["ssh_password"] = None
    return data


def _encrypt_target(target: WolTarget) -> dict:
    data = target.model_dump()
    if data.get("ssh_password"):
        data["ssh_password"] = encrypt(data["ssh_password"])
    return data


def _load() -> list[WolTarget]:
    if not _DATA_FILE.exists():
        return []
    with open(_DATA_FILE, "r", encoding="utf-8") as f:
        raw: list[dict] = json.load(f)
    return [WolTarget(**_decrypt_target(item)) for item in raw]


def _save(targets: list[WolTarget]) -> None:
    _DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps([_encrypt_target(t) for t in targets], ensure_ascii=False, indent=2)
    fd, tmp_path = tempfile.mkstemp(dir=_DATA_FILE.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, _DATA_FILE)
    except Exception:
        os.unlink(tmp_path)
        raise


def list_targets() -> list[WolTarget]:
    return _load()


def get_target(target_id: str) -> WolTarget | None:
    return next((t for t in _load() if t.id == target_id), None)


def create_target(body: WolTargetCreate) -> WolTarget:
    targets = _load()
    target = WolTarget(id=str(uuid.uuid4()), **body.model_dump())
    targets.append(target)
    _save(targets)
    return target


def update_target(target_id: str, body: WolTargetUpdate) -> WolTarget | None:
    targets = _load()
    for i, t in enumerate(targets):
        if t.id == target_id:
            updated = t.model_copy(update={k: v for k, v in body.model_dump().items() if v is not None})
            targets[i] = updated
            _save(targets)
            return updated
    return None


def delete_target(target_id: str) -> bool:
    targets = _load()
    filtered = [t for t in targets if t.id != target_id]
    if len(filtered) == len(targets):
        return False
    _save(filtered)
    return True
