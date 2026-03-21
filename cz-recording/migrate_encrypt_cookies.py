"""
쿠키 평문 데이터 암호화 마이그레이션 스크립트.

crypto.py의 fallback 제거 전에 반드시 실행해야 합니다.
평문으로 저장된 cookie_value를 Fernet으로 암호화합니다.

실행 방법:
    ENCRYPTION_KEY=<key> DATABASE_URL=<url> python migrate_encrypt_cookies.py
"""
import os
import sys

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL")
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY")

if not DATABASE_URL or not ENCRYPTION_KEY:
    print("ERROR: DATABASE_URL 과 ENCRYPTION_KEY 환경변수가 필요합니다.", file=sys.stderr)
    sys.exit(1)

cipher = Fernet(ENCRYPTION_KEY.encode())


def is_encrypted(value: str) -> bool:
    """Fernet 토큰 여부 확인 (복호화 시도)."""
    try:
        cipher.decrypt(value.encode())
        return True
    except (InvalidToken, Exception):
        return False


def main() -> None:
    engine = create_engine(DATABASE_URL)
    with engine.begin() as conn:
        rows = conn.execute(text("SELECT id, cookie_value FROM cookies")).fetchall()

        migrated = 0
        skipped = 0
        for row in rows:
            cookie_id, cookie_value = row.id, row.cookie_value
            if is_encrypted(cookie_value):
                skipped += 1
                continue
            encrypted = cipher.encrypt(cookie_value.encode()).decode()
            conn.execute(
                text("UPDATE cookies SET cookie_value = :val WHERE id = :id"),
                {"val": encrypted, "id": cookie_id},
            )
            migrated += 1

    print(f"완료: {migrated}개 암호화, {skipped}개 이미 암호화됨.")


if __name__ == "__main__":
    main()
