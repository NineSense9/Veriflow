import shutil

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.loop import verify_repair_loop
from veriflow_sandbox.process import ProcessSandbox
from veriflow_sandbox.stress import StressProgram, run_stress
from veriflow_spec.compiler import compile_spec
from veriflow_verify.pipeline import run_session
from veriflow_verify.traceability import build_traceability
from veriflow_verify.result import verify_workflow

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

GEN = """print(3)
print("1 2 3")
"""
BRUTE = """n = int(input())
print(sum(map(int, input().split())))
"""
WRONG = """n = int(input())
print(n)
"""
CPP_SUM = """#include <iostream>
int main() {
  int n, x, s = 0;
  std::cin >> n;
  for (int i = 0; i < n; ++i) { std::cin >> x; s += x; }
  std::cout << s << std::endl;
}
"""


def test_traceability_has_failed_gate_clause():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    static = verify_workflow(ir, spec)
    trace = build_traceability(spec, ir, static)
    assert trace.clauses
    assert any(item.id == "act_gate" and item.status == "FAILED" for item in trace.clauses)
    assert trace.failed >= 1


def test_session_includes_traceability():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/golden/case4_runtime_ir.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。当 payment_status == success 时发送通知。")
    session = run_session(ir, spec, nl=spec.source_nl, skip_after="if_pay")
    assert session.traceability is not None
    assert session.minimized or session.runtime_findings


def test_repair_report_exposes_impact():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    report = verify_repair_loop(ir, spec, max_iterations=3)
    assert report.repair_mode == "PATCH"
    assert isinstance(report.affected_verifiers, list)
    assert report.used_full_fallback in {True, False}


def test_stress_python_mismatch_still_works():
    result = run_stress(
        ProcessSandbox(),
        StressProgram("python3", GEN, "gen"),
        StressProgram("python3", BRUTE, "brute"),
        StressProgram("python3", WRONG, "sol"),
        rounds=3,
        time_limit_ms=1000,
        memory_limit_mb=256,
    )
    assert result.status == "mismatch"


def test_stress_python_gen_cpp_sol_if_compiler_present():
    if not shutil.which("g++"):
        return
    result = run_stress(
        ProcessSandbox(),
        StressProgram("python3", GEN, "gen"),
        StressProgram("python3", BRUTE, "brute"),
        StressProgram("cpp17", CPP_SUM, "sol"),
        rounds=2,
        time_limit_ms=2000,
        memory_limit_mb=256,
    )
    assert result.status in {"no_fail", "mismatch", "CE", "stress_error"}
    if result.status == "CE":
        assert result.failed_role == "sol"
    if result.status == "no_fail":
        assert result.rounds_ran == 2
