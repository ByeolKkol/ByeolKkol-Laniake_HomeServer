"""recording_service.py 유닛 테스트"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi import HTTPException
from services.recording_service import normalize_quality


def test_normalize_quality_valid():
    assert normalize_quality("best") == "best"
    assert normalize_quality("1080p60") == "1080p60"
    assert normalize_quality("720p") == "720p"


def test_normalize_quality_case_insensitive():
    assert normalize_quality("BEST") == "best"
    assert normalize_quality("1080P60") == "1080p60"


def test_normalize_quality_strips_whitespace():
    assert normalize_quality("  best  ") == "best"


def test_normalize_quality_none_defaults_to_best():
    assert normalize_quality(None) == "best"


def test_normalize_quality_invalid_raises():
    with pytest.raises(HTTPException) as exc_info:
        normalize_quality("4k")
    assert exc_info.value.status_code == 400
    assert "4k" in exc_info.value.detail


def test_normalize_quality_empty_string_defaults_to_best():
    assert normalize_quality("") == "best"
