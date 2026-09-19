import importlib.util
import json
from pathlib import Path

import pytest
from veriflow_api.llm import LLMResult

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


def _mock_judge(monkeypatch, responses):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key-no-network")
    iterator = iter(responses)
    monkeypatch.setattr("veriflow_api.llm.complete", lambda *args, **kwargs: next(iterator))


def test_llm_only_scores_observable_static_cases_with_matching_reference(monkeypatch):
    cases = bench.build_cases()
    eligible = [case for case in cases if not case.get("expected_runtime_fail")]
    _mock_judge(monkeypatch, [LLMResult(text='{"verdict":"PASS"}')] * len(cases))
    result = bench.llm_judge(cases, 1)
    assert len(result["cases"]) == 50
    assert result["evaluation_scope"] == "static-only"
    assert result["eligible_case_count"] == 50
    assert result["n_clean"] == 5
    assert result["n_faulty"] == 45
    assert result["excluded_runtime_case_count"] == 5
    reference = bench.summarize([bench.evaluate_case(c, "no-runtime") for c in eligible], "no-runtime")
    assert result["reference_no_runtime"]["detection_f1"] == reference["detection_f1"]
    assert result["reference_no_runtime"]["n_faulty"] == 45


def test_llm_not_run_still_records_scope_without_calls(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setattr("veriflow_api.llm.complete", lambda *a, **kw: pytest.fail("No request expected"))
    result = bench.llm_judge(bench.build_cases(), 3)
    assert result["status"] == "NOT RUN"
    assert result["metrics"] is None
    assert result["excluded_runtime_case_count"] == 5
    assert result["eligible_case_count"] == 50


def test_llm_failed_calls_count_against_effective_f1_without_inflating_parse_failures(monkeypatch):
    cases = bench.build_cases()
    clean = next(c for c in cases if c["fault"] == "clean")
    faulty = next(c for c in cases if c["fault"] != "clean")
    _mock_judge(monkeypatch, [
        LLMResult(text='{"verdict":"FAIL"}'),
        LLMResult(text='not json'),
        LLMResult(error="timeout"),
    ])
    result = bench.llm_judge([faulty, faulty, clean], 1)
    metrics = result["metrics"]
    assert metrics["valid_response_f1"] == 1.0
    assert metrics["effective_f1"] == 0.5  # TP=1, FN=1, FP=1
    assert metrics["detection_f1"] == metrics["valid_response_f1"]
    assert metrics["http_ok"] == 2
    assert metrics["http_fail"] == 1
    assert metrics["parse_failure_count"] == 1
    assert metrics["parse_failure_rate"] == 0.5  # denominator: HTTP successes
    assert metrics["abstention_count"] == 2
    assert metrics["scored_calls"] == 1
    assert result["cases"][-1]["parse_failure"] is False
    assert metrics["repeated_verdict_agreement"] is None  # no pair of valid votes


@pytest.mark.parametrize("response", ['[]', 'null', '42', '"PASS"', '{"verdict":"UNKNOWN"}', '{'])
def test_llm_no_valid_responses_have_null_scores_and_do_not_crash(monkeypatch, response):
    _mock_judge(monkeypatch, [LLMResult(text=response)])
    result = bench.llm_judge(bench.build_cases()[:1], 1)
    assert result["status"] == "FAILED"
    assert result["metrics"]["scored_calls"] == 0
    assert result["metrics"]["parse_failure_count"] == 1
    for name in ("detection_f1", "valid_response_f1", "effective_f1", "detection_precision", "detection_recall", "false_positive_rate"):
        assert result["metrics"][name] is None


def test_llm_receives_complete_workflow_json(monkeypatch):
    case = dict(bench.build_cases()[0])
    case["requirement"] += "完整工作流" * 2000
    captured = []
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key-no-network")
    def complete(messages, **kwargs):
        captured.append(messages[-1]["content"])
        return LLMResult(text='{"verdict":"PASS"}')
    monkeypatch.setattr("veriflow_api.llm.complete", complete)
    bench.llm_judge([case], 1)
    assert captured == [json.dumps(bench._llm_payload(case), ensure_ascii=False)]
    assert json.loads(captured[0])["workflow"] == case["ir"].model_dump(mode="json")
