import re
from pathlib import Path


_FILENAME_SANITIZE_RE = re.compile(r"[^\w._-]+", re.UNICODE)


def parse_cookie_string(raw_cookie: str | None) -> dict[str, str]:
    """
    Parse a `Cookie` header-style string into a dict.
    """
    if not raw_cookie:
        return {}

    parsed: dict[str, str] = {}
    for part in raw_cookie.split(";"):
        token = part.strip()
        if not token or "=" not in token:
            continue
        name, value = token.split("=", 1)
        name = name.strip()
        if not name:
            continue
        parsed[name] = value.strip()
    return parsed


def build_cookie_string(cookies: dict[str, str] | None) -> str:
    if not cookies:
        return ""
    return "; ".join(f"{name}={value}" for name, value in cookies.items())


def ensure_directory(path: str | Path) -> Path:
    directory = Path(path).expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def safe_filename(name: str, fallback: str = "recording") -> str:
    cleaned = _FILENAME_SANITIZE_RE.sub("_", name).strip("._-")
    return cleaned or fallback
