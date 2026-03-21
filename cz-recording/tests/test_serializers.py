"""serializers.py 유닛 테스트"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from serializers import mask_cookie


def test_mask_cookie_short():
    assert mask_cookie("abc") == "***"


def test_mask_cookie_long():
    result = mask_cookie("1234567890abcdef")
    assert result.startswith("1234")
    assert result.endswith("cdef")
    assert "..." in result


def test_mask_cookie_exactly_8():
    result = mask_cookie("12345678")
    assert result == "1234...5678"
