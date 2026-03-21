import os

from db import get_conn


def get_tapo_credentials() -> tuple[str, str]:
    """DB에서 Tapo 자격증명 로드. 없으면 환경변수 폴백."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT key, value FROM app_settings "
                    "WHERE key IN ('tapo_username', 'tapo_password')"
                )
                rows = {r["key"]: r["value"] for r in cur.fetchall()}
        username = rows.get("tapo_username") or os.getenv("TAPO_USERNAME", "")
        password = rows.get("tapo_password") or os.getenv("TAPO_PASSWORD", "")
        return username, password
    except Exception:
        return os.getenv("TAPO_USERNAME", ""), os.getenv("TAPO_PASSWORD", "")
