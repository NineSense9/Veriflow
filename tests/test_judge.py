import shutil
from pathlib import Path

import pytest

from veriflow_sandbox.judge import Case, judge_submission
from veriflow_sandbox.process import ProcessSandbox

ROOT = Path(__file__).resolve().parents[1]


def _vf1001_tests() -> list[Case]:
    cases: list[Case] = []
    for visibility in ("public", "hidden"):
        folder = ROOT / "examples/problems/VF1001/tests" / visibility
        for stdin_path in sorted(folder.glob("*.in")):
            cases.append(
                Case(
                    stdin=stdin_path.read_text(encoding="utf-8"),
                    stdout=stdin_path.with_suffix(".out").read_text(encoding="utf-8"),
                    visibility=visibility,
                    name=stdin_path.stem,
                )
            )
    return cases


def test_python_ac():
    source = (ROOT / "examples/problems/VF1001/ref.py").read_text(encoding="utf-8")
    result = judge_submission(
        ProcessSandbox(), "python3", source, _vf1001_tests(), 1000, 256
    )
    assert result.verdict == "AC"
    assert result.counterexample is None


def test_python_wa_has_minimal_counterexample():
    source = "n = int(input())\nprint(n)\n"
    result = judge_submission(
        ProcessSandbox(), "python3", source, _vf1001_tests(), 1000, 256
    )
    assert result.verdict == "WA"
    assert result.counterexample is not None
    assert result.counterexample["source"] == "public"
    assert "stdin" in result.counterexample
    assert "expected" in result.counterexample
    assert "actual" in result.counterexample
    assert result.counterexample["expected"].strip().split() == ["6"]


def test_python_hidden_counterexample():
    source = """
n = int(input())
a = list(map(int, input().split()))
print(sum(a) if n > 1 else 1)
"""
    result = judge_submission(
        ProcessSandbox(), "python3", source, _vf1001_tests(), 1000, 256
    )
    assert result.verdict == "WA"
    assert result.counterexample is not None
    assert result.counterexample["source"] == "hidden"
    assert result.counterexample["expected"].strip() == "0"


def test_python_ce():
    result = judge_submission(
        ProcessSandbox(), "python3", "def (\n", _vf1001_tests(), 1000, 256
    )
    assert result.verdict == "CE"
    assert result.stage == "compiling"


def test_python_tle():
    source = "while True:\n    pass\n"
    result = judge_submission(
        ProcessSandbox(), "python3", source, _vf1001_tests(), 400, 256
    )
    assert result.verdict == "TLE"


@pytest.mark.skipif(shutil.which("g++") is None, reason="g++ not installed")
def test_cpp_ac():
    source = """
#include <iostream>
int main() {
  int n;
  std::cin >> n;
  long long sum = 0, x;
  for (int i = 0; i < n; i++) {
    std::cin >> x;
    sum += x;
  }
  std::cout << sum << "\\n";
  return 0;
}
"""
    result = judge_submission(
        ProcessSandbox(), "cpp17", source, _vf1001_tests(), 1000, 256
    )
    assert result.verdict == "AC"
