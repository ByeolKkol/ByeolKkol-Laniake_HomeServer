from __future__ import annotations

import socket


def send_magic_packet(mac: str, ip: str | None = None) -> None:
    """WOL 매직 패킷 전송. mac: AA:BB:CC:DD:EE:FF 형식.
    ip가 있으면 서브넷 브로드캐스트(/24 가정)로도 전송."""
    mac_bytes = bytes.fromhex(mac.replace(":", ""))
    packet = b'\xff' * 6 + mac_bytes * 16
    targets = ['255.255.255.255']
    if ip:
        parts = ip.rsplit('.', 1)
        targets.append(f"{parts[0]}.255")
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        for addr in targets:
            s.sendto(packet, (addr, 9))
