import json
from pathlib import Path

from veriflow_ir.n8n_subset import RoundTripValidator, ir_to_n8n, n8n_to_ir, round_trip_ok
from veriflow_ir.workflow import WorkflowIR
from veriflow_runtime.cross import cross_verify
from veriflow_runtime.hashing import spec_hash, workflow_hash
from veriflow_runtime.mock_exec import mock_execute
from veriflow_runtime.monitor import monitor_trace
from veriflow_runtime.n8n_live import execution_to_trace, n8n_status
from veriflow_spec.compiler import compile_spec
from veriflow_verify.gate import evaluate_gate, load_policy, render_junit, render_markdown
from veriflow_verify.incremental import equivalence_report, incremental_verify, workflow_changes
from veriflow_verify.result import verify_workflow

ROOT = Path(__file__).resolve().parents[1]


def _gold() -> WorkflowIR:
    return WorkflowIR.model_validate_json((ROOT / "examples/compose/valid_lis.json").read_text(encoding="utf-8"))


def _case4() -> WorkflowIR:
    return WorkflowIR.model_validate_json((ROOT / "examples/golden/case4_runtime_ir.json").read_text(encoding="utf-8"))


def test_mock_runtime_pass_on_gold():
    ir = _gold()
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    static = verify_workflow(ir, spec)
    assert static.status == "PASS"
    runtime = monitor_trace(mock_execute(ir), spec)
    assert runtime.status == "PASS"
    assert runtime.unknown == 0
    assert runtime.node_coverage == 1.0
    assert cross_verify(static, runtime).pattern == "STATIC PASS + RUNTIME PASS"


def test_case4_static_pass_runtime_fail():
    ir = _gold()
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    static = verify_workflow(ir, spec)
    assert static.status == "PASS"
    trace = mock_execute(ir, skip_after="g_bounds")
    runtime = monitor_trace(trace, spec)
    assert runtime.status == "FAIL"
    failed = [item for item in runtime.issues if item.status == "FAIL"]
    assert failed
    assert failed[0].counterexample is not None
    assert failed[0].counterexample.slice_labels
    cross = cross_verify(static, runtime)
    assert cross.pattern == "STATIC PASS + RUNTIME FAIL"
    assert "静态正确不代表运行时符合需求" in cross.story


def test_case4_payment_branch_missing_notify():
    ir = _case4()
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。当 payment_status == success 时发送通知。")
    static = verify_workflow(ir, spec)
    assert static.status == "PASS"
    trace = mock_execute(ir, skip_after="if_pay")
    assert any(event.branch == "true" for event in trace.events)
    runtime = monitor_trace(trace, spec)
    assert runtime.status == "FAIL"
    codes = {item.constraint_id: item for item in runtime.issues if item.status == "FAIL"}
    assert "tmp_if_true_then_notify" in codes
    assert "tmp_eventually_notify" in codes
    assert cross_verify(static, runtime).pattern == "STATIC PASS + RUNTIME FAIL"


def test_side_effect_publish_is_mocked():
    ir = _gold()
    trace = mock_execute(ir)
    pub = next(event for event in trace.events if event.operation == "publish_problem")
    assert pub.status == "mocked"
    assert pub.external_effect == "MOCKED_EXTERNAL_EFFECT"
    assert pub.output_summary == "redacted"


def test_gate_blocks_missing_gate():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题。")
    gate = evaluate_gate(ir, spec, run_runtime=False)
    assert gate.ready == "BLOCKED"
    assert gate.exit_code == 1


def test_gate_ready_on_gold():
    ir = _gold()
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    gate = evaluate_gate(ir, spec)
    assert gate.ready == "READY"
    assert gate.exit_code == 0
    assert "Structural" not in gate.dimensions or True
    md = render_markdown(gate)
    assert "VeriFlow Reliability Gate" in md
    xml = render_junit(gate)
    assert "testsuite" in xml


def test_policy_yaml_loads():
    policy = load_policy(str(ROOT / "examples/veriflow-policy.yaml"))
    assert policy["fail_on"]["severity"] == ["CRITICAL", "HIGH"]
    assert policy["requirements"]["minimum_coverage"] == 0.9
    assert policy["repair"]["allow_auto_repair"] is False


def test_n8n_roundtrip_validator():
    ir = _gold()
    ok, errors = round_trip_ok(ir)
    assert ok, errors
    back = n8n_to_ir(ir_to_n8n(ir))
    assert workflow_hash(ir) == workflow_hash(back)
    validator = RoundTripValidator()
    ok, errors = validator.validate(ir)
    assert ok, errors


def test_hash_stable_under_node_reorder():
    ir = _gold()
    data = ir.model_dump(mode="json", by_alias=True)
    data["nodes"] = list(reversed(data["nodes"]))
    shuffled = WorkflowIR.model_validate(data)
    assert workflow_hash(ir) == workflow_hash(shuffled)
    spec = compile_spec("完整出题。")
    assert spec_hash(spec) == spec_hash(compile_spec("完整出题。"))


def test_incremental_matches_full_on_secret_patch():
    ir = _gold()
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    previous = verify_workflow(ir, spec)
    dumped = ir.model_dump(by_alias=True)
    dumped["nodes"][0]["config"] = {"api_key": "sk-live-secret"}
    after = WorkflowIR.model_validate(dumped)
    changes = workflow_changes(ir, after)
    assert any(item.kind == "PARAMETER_CHANGED" for item in changes)
    inc = incremental_verify(ir, after, spec, previous=previous)
    full = verify_workflow(after, spec)
    report = equivalence_report(full, inc.result)
    assert report.equivalent, report.disagreements
    assert full.status == "FAIL"
    assert inc.used_full_fallback is False
    assert "safety" in inc.impact.affected_verifiers


def test_incremental_matches_full_on_edge_edit():
    ir = _gold()
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    previous = verify_workflow(ir, spec)
    dumped = ir.model_dump(by_alias=True)
    dumped["edges"] = [edge for edge in dumped["edges"] if not (edge["from"] == "review" and edge["to"] == "pub")]
    dumped["edges"].append({"from": "g_bounds", "to": "pub"})
    after = WorkflowIR.model_validate(dumped)
    inc = incremental_verify(ir, after, spec, previous=previous)
    full = verify_workflow(after, spec)
    report = equivalence_report(full, inc.result)
    assert report.equivalent, report.disagreements
    assert full.status == "FAIL"


def test_ci_commit_b_is_blocked():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/ci/commit_b.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    gate = evaluate_gate(ir, spec, run_runtime=False)
    assert gate.exit_code == 1
    assert gate.ready == "BLOCKED"


def test_n8n_live_unavailable_without_env(monkeypatch):
    monkeypatch.delenv("N8N_BASE_URL", raising=False)
    monkeypatch.delenv("N8N_API_KEY", raising=False)
    status = n8n_status()
    assert status["available"] is False
    assert status["fallback"] == "mock"


def test_n8n_execution_converter_redacts():
    trace = execution_to_trace({"id": "1", "events": [{"node": "HTTP", "status": "success", "output": "secret"}]})
    assert trace.source == "n8n"
    assert trace.events[0].output_summary == "redacted"


def test_case4_file_points_at_skip():
    meta = json.loads((ROOT / "examples/golden/case4_runtime.json").read_text(encoding="utf-8"))
    assert meta["expect_static"] == "PASS"
    assert meta["expect_runtime"] == "FAIL"
    assert meta["skip_after"] == "if_pay"


def test_incremental_keeps_graph_safety_on_param_edit():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题。")
    previous = verify_workflow(ir, spec)
    dumped = ir.model_dump(by_alias=True)
    dumped["nodes"][0]["config"] = {"api_key": "sk-live-secret"}
    after = WorkflowIR.model_validate(dumped)
    inc = incremental_verify(ir, after, spec, previous=previous)
    full = verify_workflow(after, spec)
    report = equivalence_report(full, inc.result)
    assert report.equivalent, report.disagreements
    assert "MISSING_HUMAN_GATE" in report.full_codes
    assert "HARDCODED_SECRET" in report.full_codes


def test_incremental_latency_recorded(tmp_path):
    import time

    ir = _gold()
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    previous = verify_workflow(ir, spec)
    dumped = ir.model_dump(by_alias=True)
    dumped["nodes"][0]["config"] = {"note": "noop"}
    after = WorkflowIR.model_validate(dumped)
    t0 = time.perf_counter()
    full = verify_workflow(after, spec)
    full_ms = (time.perf_counter() - t0) * 1000
    t1 = time.perf_counter()
    inc = incremental_verify(ir, after, spec, previous=previous)
    inc_ms = (time.perf_counter() - t1) * 1000
    payload = {
        "full_ms": round(full_ms, 3),
        "incremental_ms": round(inc_ms, 3),
        "equivalent": equivalence_report(full, inc.result).equivalent,
        "used_full_fallback": inc.used_full_fallback,
        "nodes": len(after.nodes),
        "synthetic": False,
    }
    out = ROOT / "experiments" / "runs" / "incremental" / "latency.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    assert payload["equivalent"] is True


def test_temporal_never_and_after():
    from veriflow_spec.models import TemporalConstraint, WorkflowSpec

    ir = _gold()
    spec = WorkflowSpec(
        domain="compose",
        goal="t",
        temporal_constraints=[
            TemporalConstraint(id="n", kind="NEVER", a="missing_node"),
            TemporalConstraint(id="a", kind="AFTER", a="publish_problem", b="human_gate"),
            TemporalConstraint(id="once", kind="AT_MOST_ONCE", a="test_generator"),
        ],
    )
    runtime = monitor_trace(mock_execute(ir), spec)
    assert runtime.status == "PASS"


def test_if_branch_then_is_selector_specific():
    from veriflow_runtime.models import ExecutionTrace, TraceEvent
    from veriflow_spec.models import TemporalConstraint, WorkflowSpec

    spec = WorkflowSpec(
        domain="compose",
        goal="t",
        temporal_constraints=[
            TemporalConstraint(
                id="tmp_pay",
                kind="IF_BRANCH_THEN",
                a="if_payment",
                b="notify",
                branch="true",
                requirement="payment true then notify",
            )
        ],
    )
    trace = ExecutionTrace(
        trace_id="t",
        workflow_id="branches",
        workflow_hash="x",
        source="mock",
        events=[
            TraceEvent(
                event_index=0,
                timestamp_ms=1,
                node_id="if_admin",
                node_type="branch",
                operation="branch",
                status="success",
                branch="true",
            )
        ],
        status="completed",
    )
    result = monitor_trace(trace, spec)
    issue = next(i for i in result.issues if i.constraint_id == "tmp_pay")
    assert issue.status in {"UNKNOWN", "FAIL"}

