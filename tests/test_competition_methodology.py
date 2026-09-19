import importlib.util
from pathlib import Path

from veriflow_ir.workflow import WorkflowIR
from veriflow_spec.compiler import compile_spec
from veriflow_verify.result import verify_workflow

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location(
    "competition_benchmark", ROOT / "scripts" / "competition_benchmark.py"
)
bench = importlib.util.module_from_spec(_spec)
assert _spec.loader
_spec.loader.exec_module(bench)


def test_ablation_no_safety_keeps_runtime_monitor():
    src = (ROOT / "scripts/competition_benchmark.py").read_text(encoding="utf-8")
    assert "no-safety" in src
    assert 'mode in {"full", "no-safety"}' in src
    cases = bench.build_cases()
    runtime = next(c for c in cases if c["fault"] == "runtime_skip_after_branch")
    full = bench.evaluate_case(runtime, "full")
    no_safety = bench.evaluate_case(runtime, "no-safety")
    no_runtime = bench.evaluate_case(runtime, "no-runtime")
    assert full["detected"] is True
    assert no_safety["detected"] is True
    assert no_runtime["detected"] is False
    assert no_safety["runtime_ms"] is not None
    assert no_runtime["runtime_ms"] is None


def test_llm_payload_has_no_gold_leakage():
    cases = bench.build_cases()
    faulty = next(c for c in cases if c["fault"] != "clean")
    payload = bench._llm_payload(faulty)
    assert set(payload) == {"requirement", "workflow"}
    for key in bench.LLM_FORBIDDEN_KEYS:
        assert key not in payload
    src = (ROOT / "scripts/competition_benchmark.py").read_text(encoding="utf-8")
    assert "fault_hint" not in src.split("LLM_FORBIDDEN_KEYS", 1)[1][:200] or '"fault_hint"' in src
    assert '"fault_hint":' not in src
    assert "完整出题流程" not in src


def test_runtime_faults_are_not_in_static_repair_denominator():
    cases = bench.build_cases()
    runtime = [c for c in cases if c["category"] == "runtime"]
    assert len(runtime) > 1
    assert all(c["repair_applicable"] is False for c in runtime)
    static_faults = [c for c in cases if c["fault"] != "clean" and c["repair_applicable"]]
    assert static_faults


def test_detection_is_looser_than_diagnosis():
    cases = bench.build_cases()
    broken = next(c for c in cases if c["fault"] == "broken_binding")
    row = bench.evaluate_case(broken, "full")
    assert row["detected"] is True
    # diagnosis requires exact expected_detection code, not aliases
    if broken["expected"] not in row["codes"]:
        assert row["diagnosed"] is False


def test_dataset_has_distinct_topologies_and_runtime_faults():
    families = {b["topology"] for b in bench.BASES}
    assert {"linear", "merge", "dataflow", "safety", "branch"} <= families
    assert len(bench.BASES) >= 5
    assert len({b["path"] for b in bench.BASES}) == len(bench.BASES)
    cases = bench.build_cases()
    runtime = [c for c in cases if c["category"] == "runtime"]
    assert len(runtime) > 1
    cats = {c["category"] for c in cases if c["fault"] != "clean"}
    for required in bench.REQUIRED_CATEGORIES:
        assert required in cats
    names = [WorkflowIR.model_validate_json(b["path"].read_text(encoding="utf-8")).name for b in bench.BASES]
    assert len(set(names)) == len(names)


def test_clean_bases_pass_current_verifier():
    for base in bench.BASES:
        ir = WorkflowIR.model_validate_json(base["path"].read_text(encoding="utf-8"))
        spec = compile_spec(base["requirement"], ir.domain)
        result = verify_workflow(ir, spec)
        assert result.status == "PASS", (base["id"], [i.code for i in result.issues])


def test_seed_is_not_used_as_fake_rng():
    src = (ROOT / "scripts/competition_benchmark.py").read_text(encoding="utf-8")
    assert "deterministic enumeration" in src.lower() or "Deterministic enumeration" in src
    assert "random.Random" not in src
