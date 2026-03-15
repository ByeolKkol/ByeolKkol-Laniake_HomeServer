from __future__ import annotations

import socket
import subprocess


def check_online(ip: str, ssh_port: int | None = None) -> bool:
    """PC 온라인 여부 확인. SSH 포트가 있으면 TCP 체크, 없으면 ICMP ping."""
    if ssh_port:
        return _tcp_check(ip, ssh_port)
    return _ping(ip)


def _tcp_check(ip: str, port: int) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=2):
            return True
    except OSError:
        return False


def _ping(ip: str) -> bool:
    result = subprocess.run(
        ["ping", "-c", "1", "-W", "1", ip],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0
