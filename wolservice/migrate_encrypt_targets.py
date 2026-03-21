"""
WOL 타겟 SSH 비밀번호 평문 데이터 암호화 마이그레이션 스크립트.

crypto.py의 fallback 제거 전에 반드시 실행해야 합니다.
/app/data/wol_targets.json 의 평문 ssh_password를 Fernet으로 암호화합니다.

실행 방법:
    ENCRYPTION_KEY=<key> python migrate_encrypt_targets.py [--data-file /path/to/wol_targets.json]
"""
import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY")

if not ENCRYPTION_KEY:
    print("ERROR: ENCRYPTION_KEY 환경변수가 필요합니다.", file=sys.stderr)
    sys.exit(1)

cipher = Fernet(ENCRYPTION_KEY.encode())


def is_encrypted(value: str) -> bool:
    try:
        cipher.decrypt(value.encode())
        return True
    except (InvalidToken, Exception):
        return False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-file", default="/app/data/wol_targets.json")
    args = parser.parse_args()

    data_file = Path(args.data_file)
    if not data_file.exists():
        print(f"파일 없음: {data_file} (타겟 없음, 종료)")
        return

    with open(data_file, "r", encoding="utf-8") as f:
        targets: list[dict] = json.load(f)

    migrated = 0
    for target in targets:
        password = target.get("ssh_password")
        if not password:
            continue
        if is_encrypted(password):
            continue
        target["ssh_password"] = cipher.encrypt(password.encode()).decode()
        migrated += 1

    # atomic write
    fd, tmp_path = tempfile.mkstemp(dir=data_file.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(targets, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, data_file)
    except Exception:
        os.unlink(tmp_path)
        raise

    print(f"완료: {migrated}개 암호화됨.")


if __name__ == "__main__":
    main()
