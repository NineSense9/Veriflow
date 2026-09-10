from veriflow_sandbox.process import ProcessSandbox
from veriflow_sandbox.stress import StressProgram, run_stress

GEN = """print(3)
print("1 2 3")
"""
BRUTE = """n = int(input())
print(sum(map(int, input().split())))
"""
WRONG = """n = int(input())
print(n)
"""
RIGHT = """n = int(input())
print(sum(map(int, input().split())))
"""


def _prog(source: str, role: str) -> StressProgram:
    return StressProgram(lang="python3", source=source, role=role)


def test_stress_finds_mismatch():
    result = run_stress(
        ProcessSandbox(),
        _prog(GEN, "gen"),
        _prog(BRUTE, "brute"),
        _prog(WRONG, "sol"),
        rounds=5,
        time_limit_ms=1000,
        memory_limit_mb=256,
    )
    assert result.status == "mismatch"
    assert result.rounds_ran == 1
    assert result.counterexample is not None
    assert result.counterexample["source"] == "stress"
    assert result.counterexample["expected"].strip() == "6"
    assert result.counterexample["actual"].strip() == "3"


def test_stress_no_fail_when_correct():
    result = run_stress(
        ProcessSandbox(),
        _prog(GEN, "gen"),
        _prog(BRUTE, "brute"),
        _prog(RIGHT, "sol"),
        rounds=3,
        time_limit_ms=1000,
        memory_limit_mb=256,
    )
    assert result.status == "no_fail"
    assert result.rounds_ran == 3
    assert result.counterexample is None


def test_stress_brute_timeout_is_not_wa():
    brute = "while True:\n    pass\n"
    result = run_stress(
        ProcessSandbox(),
        _prog(GEN, "gen"),
        _prog(brute, "brute"),
        _prog(RIGHT, "sol"),
        rounds=2,
        time_limit_ms=300,
        memory_limit_mb=256,
    )
    assert result.status == "stress_error"
    assert result.failed_role == "brute"
    assert result.detail == "brute_tle"


def test_stress_sol_ce():
    result = run_stress(
        ProcessSandbox(),
        _prog(GEN, "gen"),
        _prog(BRUTE, "brute"),
        _prog("def (\n", "sol"),
        rounds=2,
        time_limit_ms=1000,
        memory_limit_mb=256,
    )
    assert result.status == "CE"
    assert result.failed_role == "sol"
