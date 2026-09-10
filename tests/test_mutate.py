from pathlib import Path

from veriflow_mutate.kill import kill_rate
from veriflow_mutate.ops import mutate_source

ROOT = Path(__file__).resolve().parents[1]


def test_mutants_include_range_and_augassign():
    source = (ROOT / "examples/problems/VF1001/ref.py").read_text(encoding="utf-8")
    names = {name for name, _ in mutate_source(source)}
    assert any(name.startswith("range_") for name in names)
    assert any(name.startswith("aug_") for name in names)


def test_hidden_tests_kill_off_by_one():
    source = (ROOT / "examples/problems/VF1001/ref.py").read_text(encoding="utf-8")
    tests = []
    for visibility in ("public", "hidden"):
        folder = ROOT / "examples/problems/VF1001/tests" / visibility
        for stdin_path in sorted(folder.glob("*.in")):
            tests.append(
                (
                    stdin_path.read_text(encoding="utf-8"),
                    stdin_path.with_suffix(".out").read_text(encoding="utf-8"),
                )
            )
    result = kill_rate(source, tests)
    assert result["total"] >= 2
    assert result["killed"] >= 1
    assert result["kill_rate"] is not None
    assert result["kill_rate"] > 0
