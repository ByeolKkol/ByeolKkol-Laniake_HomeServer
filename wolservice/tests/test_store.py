"""wolservice/services/store.py 유닛 테스트"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from cryptography.fernet import Fernet
from pathlib import Path


@pytest.fixture(autouse=True)
def setup_env(monkeypatch, tmp_path):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("ENCRYPTION_KEY", key)
    import crypto
    crypto._cipher = None
    import services.store as store
    monkeypatch.setattr(store, "_DATA_FILE", tmp_path / "wol_targets.json")
    store._DATA_FILE = tmp_path / "wol_targets.json"
    return tmp_path


def test_empty_list_when_no_file():
    from services.store import list_targets
    result = list_targets()
    assert result == []


def test_create_and_list(setup_env):
    from services.store import create_target, list_targets
    from models.target import WolTargetCreate

    body = WolTargetCreate(name="테스트PC", mac="AA:BB:CC:DD:EE:FF")
    created = create_target(body)
    assert created.name == "테스트PC"
    assert created.mac == "AA:BB:CC:DD:EE:FF"
    assert created.id  # UUID 생성됨

    targets = list_targets()
    assert len(targets) == 1
    assert targets[0].id == created.id


def test_delete_target(setup_env):
    from services.store import create_target, delete_target, list_targets
    from models.target import WolTargetCreate

    body = WolTargetCreate(name="삭제PC", mac="11:22:33:44:55:66")
    created = create_target(body)
    result = delete_target(created.id)
    assert result is True
    assert list_targets() == []


def test_delete_nonexistent_returns_false():
    from services.store import delete_target
    assert delete_target("nonexistent-id") is False


def test_atomic_write_on_save(setup_env, tmp_path):
    """저장 후 임시 파일이 남지 않는지 확인."""
    from services.store import create_target
    from models.target import WolTargetCreate

    create_target(WolTargetCreate(name="PC", mac="AA:BB:CC:DD:EE:FF"))
    tmp_files = list(tmp_path.glob("*.tmp"))
    assert tmp_files == [], f"임시 파일이 남아 있음: {tmp_files}"


def test_ssh_password_encrypted_at_rest(setup_env, tmp_path):
    """저장된 JSON에서 ssh_password가 평문으로 노출되지 않는지 확인."""
    from services.store import create_target
    from models.target import WolTargetCreate
    import services.store as store

    create_target(WolTargetCreate(name="PC", mac="AA:BB:CC:DD:EE:FF", ssh_password="my_secret"))
    raw = json.loads(store._DATA_FILE.read_text())
    stored_password = raw[0].get("ssh_password")
    assert stored_password != "my_secret", "비밀번호가 평문으로 저장됨"
