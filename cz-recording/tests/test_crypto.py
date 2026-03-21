"""crypto.py 유닛 테스트"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from cryptography.fernet import Fernet


def _make_cipher_env(monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("ENCRYPTION_KEY", key)
    # 캐시 리셋
    import crypto
    crypto._cipher = None
    return key


def test_encrypt_decrypt_roundtrip(monkeypatch):
    _make_cipher_env(monkeypatch)
    import crypto
    plaintext = "secret_cookie_value"
    encrypted = crypto.encrypt(plaintext)
    assert encrypted != plaintext
    assert crypto.decrypt(encrypted) == plaintext


def test_decrypt_invalid_token_raises(monkeypatch):
    _make_cipher_env(monkeypatch)
    import crypto
    with pytest.raises(ValueError):
        crypto.decrypt("not_a_valid_fernet_token")


def test_decrypt_wrong_key_raises(monkeypatch):
    _make_cipher_env(monkeypatch)
    import crypto
    encrypted = crypto.encrypt("secret")

    # 다른 키로 교체
    new_key = Fernet.generate_key().decode()
    monkeypatch.setenv("ENCRYPTION_KEY", new_key)
    crypto._cipher = None

    with pytest.raises(ValueError):
        crypto.decrypt(encrypted)
