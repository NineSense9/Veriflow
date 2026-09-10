from veriflow_api.tutor import REFUSAL, fallback_question, is_spoiler


def test_spoiler_detects_code_and_editorial():
    assert is_spoiler("标准答案如下")
    assert is_spoiler("```python\nprint(1)\n```")
    assert is_spoiler("int main() { return 0; }")
    assert not is_spoiler("循环在 i=n-1 时不变量还成立吗？")


def test_fallback_empty_output():
    question = fallback_question(
        {"stdin": "3\n1 2 3\n", "expected": "6\n", "actual": ""},
        ["总和等于所有停留秒数相加"],
    )
    assert "空" in question
    assert "```" not in question
    assert "标准答案" not in question


def test_fallback_n1():
    question = fallback_question(
        {"stdin": "1\n0\n", "expected": "0\n", "actual": "1\n"},
        [],
    )
    assert "n=1" in question


def test_refusal_constant():
    assert "拒发题解" in REFUSAL
