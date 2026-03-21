"""wolservice WOL 매직 패킷 로직 유닛 테스트"""
import sys
import os
import socket
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _build_packet(mac: str) -> bytes:
    """wol.py의 패킷 생성 로직을 추출해 테스트."""
    mac_bytes = bytes.fromhex(mac.replace(":", "").replace("-", ""))
    return b"\xff" * 6 + mac_bytes * 16


def test_magic_packet_length():
    packet = _build_packet("AA:BB:CC:DD:EE:FF")
    assert len(packet) == 102


def test_magic_packet_starts_with_ff():
    packet = _build_packet("AA:BB:CC:DD:EE:FF")
    assert packet[:6] == b"\xff" * 6


def test_magic_packet_mac_repeated_16_times():
    packet = _build_packet("AA:BB:CC:DD:EE:FF")
    mac_bytes = bytes.fromhex("AABBCCDDEEFF")
    for i in range(16):
        assert packet[6 + i * 6: 6 + (i + 1) * 6] == mac_bytes


def test_send_magic_packet_calls_sendto():
    """send_magic_packet이 255.255.255.255:9 로 UDP 전송하는지 확인."""
    from services.wol import send_magic_packet

    mock_socket = MagicMock()
    with patch("socket.socket") as MockSocket:
        MockSocket.return_value.__enter__ = lambda s: mock_socket
        MockSocket.return_value.__exit__ = MagicMock(return_value=False)
        send_magic_packet("AA:BB:CC:DD:EE:FF")

    mock_socket.sendto.assert_called()
    call_args = mock_socket.sendto.call_args_list
    destinations = [args[0][1] for args in call_args]
    assert ("255.255.255.255", 9) in destinations
