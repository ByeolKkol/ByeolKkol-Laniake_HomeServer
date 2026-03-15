from __future__ import annotations

import json
import uuid
from pathlib import Path

from models.target import WolTarget, WolTargetCreate, WolTargetUpdate

_DATA_FILE = Path("/app/data/wol_targets.json")


def _load() -> list[WolTarget]:
    if not _DATA_FILE.exists():
        return []
    try:
        raw: list[dict] = json.loads(_DATA_FILE.read_text())
        return [WolTarget(**item) for item in raw]
    except Exception:
        return []


def _save(targets: list[WolTarget]) -> None:
    _DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    _DATA_FILE.write_text(
        json.dumps([t.model_dump() for t in targets], ensure_ascii=False, indent=2)
    )


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
