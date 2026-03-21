import os

from cryptography.fernet import Fernet, InvalidToken

_cipher: Fernet | None = None


def _get_cipher() -> Fernet:
    global _cipher
    if _cipher is None:
        key = os.environ.get("ENCRYPTION_KEY", "")
        if not key:
            raise RuntimeError("ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.")
        _cipher = Fernet(key.encode())
    return _cipher


def encrypt(plaintext: str) -> str:
    return _get_cipher().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Fernet 복호화. 실패 시 ValueError 발생."""
    try:
        return _get_cipher().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("복호화 실패: 키가 틀리거나 데이터가 손상되었습니다.") from exc
