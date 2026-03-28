from __future__ import annotations

import re
import time

import paramiko

from models.target import OsType

_SHUTDOWN_CMD: dict[OsType, str] = {
    "windows": "shutdown /s /t 0\r\n",
    "linux": "sudo shutdown -h now\n",
    "synology": "sudo poweroff\n",
}
_REBOOT_CMD: dict[OsType, str] = {
    "windows": "shutdown /r /t 0\r\n",
    "linux": "sudo reboot\n",
    "synology": "sudo reboot\n",
}


def _strip_ansi(text: str) -> str:
    return re.sub(r'\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b\[[?][0-9;]*[hl]', '', text)


def _connect(ip: str, port: int, user: str, password: str) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.WarningPolicy())
    client.connect(
        ip, port=port, username=user, password=password,
        timeout=10, look_for_keys=False, allow_agent=False, auth_timeout=10,
    )
    return client


def _run_via_shell(client: paramiko.SSHClient, cmd: str) -> None:
    """PTY + interactive shell 방식으로 명령 실행 (Windows 호환)."""
    chan = client.get_transport().open_session()
    chan.get_pty(term='vt100', width=80, height=24)
    chan.invoke_shell()
    time.sleep(1.5)
    chan.recv(4096)  # 초기 프롬프트 소비
    chan.send(cmd)
    time.sleep(1)
    chan.close()


def shutdown(ip: str, port: int, user: str, password: str, os_type: OsType) -> None:
    """SSH로 원격 PC 종료."""
    client = _connect(ip, port, user, password)
    try:
        _run_via_shell(client, _SHUTDOWN_CMD[os_type])
    finally:
        client.close()


def reboot(ip: str, port: int, user: str, password: str, os_type: OsType) -> None:
    """SSH로 원격 PC 재시작."""
    client = _connect(ip, port, user, password)
    try:
        _run_via_shell(client, _REBOOT_CMD[os_type])
    finally:
        client.close()
