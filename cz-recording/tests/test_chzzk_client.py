"""chzzk_client.py 유닛 테스트"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.chzzk_client import extract_display_name, extract_stream_title


def test_extract_display_name_channel_name():
    payload = {"channelName": "테스트채널"}
    assert extract_display_name(payload) == "테스트채널"


def test_extract_display_name_nested_channel():
    payload = {"channel": {"channelName": "중첩채널"}}
    assert extract_display_name(payload) == "중첩채널"


def test_extract_display_name_none():
    assert extract_display_name(None) is None
    assert extract_display_name({}) is None


def test_extract_stream_title_live_title():
    payload = {"liveTitle": "라이브 방송 중"}
    assert extract_stream_title(payload) == "라이브 방송 중"


def test_extract_stream_title_strips():
    payload = {"liveTitle": "  공백 포함  "}
    assert extract_stream_title(payload) == "공백 포함"


def test_extract_stream_title_nested_live():
    payload = {"live": {"title": "중첩 제목"}}
    assert extract_stream_title(payload) == "중첩 제목"


def test_extract_stream_title_none():
    assert extract_stream_title(None) is None
    assert extract_stream_title({}) is None
