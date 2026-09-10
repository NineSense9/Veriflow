import pytest
from pydantic import ValidationError

from veriflow_ir.spec import ProblemSpec


def test_parse_vf1012_spec():
    spec = ProblemSpec.model_validate(
        {
            "ir_version": "1.0",
            "id": "VF1012",
            "title": "最短合格跨度",
            "tags": ["binary-search", "implementation"],
            "difficulty": 1200,
            "languages": ["cpp17", "python3"],
            "time_limit_ms": 1000,
            "memory_limit_mb": 256,
            "signature": {
                "input": "第一行整数 n (1≤n≤1e5)；第二行 n 个整数",
                "output": "一行一个整数",
            },
            "pre": ["n >= 1", "len(a) == n"],
            "post": ["输出为单个整数"],
            "invariants": ["答案对任意前缀判定单调"],
            "public_tests": [{"stdin": "3\n1 3 2\n", "stdout": "2\n"}],
            "hidden_policy": "attacker+bank",
            "has_brute": True,
            "forbidden": ["交互", "读额外文件"],
        }
    )
    assert spec.id == "VF1012"
    assert spec.languages == ["cpp17", "python3"]
    assert spec.has_brute is True


def test_reject_missing_id():
    with pytest.raises(ValidationError):
        ProblemSpec.model_validate(
            {
                "ir_version": "1.0",
                "title": "x",
                "tags": [],
                "difficulty": 800,
                "languages": ["python3"],
                "time_limit_ms": 1000,
                "memory_limit_mb": 256,
                "signature": {"input": "", "output": ""},
            }
        )


def test_reject_unknown_language():
    with pytest.raises(ValidationError):
        ProblemSpec.model_validate(
            {
                "ir_version": "1.0",
                "id": "VF0000",
                "title": "x",
                "tags": [],
                "difficulty": 800,
                "languages": ["java"],
                "time_limit_ms": 1000,
                "memory_limit_mb": 256,
                "signature": {"input": "", "output": ""},
            }
        )
