from pathlib import Path

from veriflow_ir.adapter import ComposeJsonAdapter, N8nAdapter, get_adapter
from veriflow_ir.workflow import WorkflowIR
from veriflow_mutate.ir_faults import mutate_ir
from veriflow_repair.loop import verify_repair_loop
from veriflow_spec.compiler import compile_spec
from veriflow_staticcheck.check import check_workflow
from veriflow_verify.result import verify_workflow

ROOT = Path(__file__).resolve().parents[1]


def _load(name: str) -> WorkflowIR:
    return WorkflowIR.model_validate_json(
        (ROOT / "examples/compose" / name).read_text(encoding="utf-8")
    )


def test_adapter_compose_roundtrip():
    ir = _load("valid_lis.json")
    adapter = get_adapter("compose-json")
    again = adapter.to_ir(adapter.from_ir(ir))
    assert again.name == ir.name


def test_n8n_adapter_is_planned():
    try:
        N8nAdapter().to_ir({})
    except NotImplementedError as exc:
        assert "planned" in str(exc)
    else:
        raise AssertionError("n8n must stay unimplemented")


def test_valid_still_passes_legacy_and_multidim():
    ir = _load("valid_lis.json")
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。", "compose")
    assert check_workflow(ir) == []
    result = verify_workflow(ir, spec)
    assert result.status == "PASS"
    assert result.risk_level == "LOW"


def test_missing_gate_has_witness_and_issue():
    ir = _load("missing_gate.json")
    spec = compile_spec("把题直接入库，不要审题门。")
    result = verify_workflow(ir, spec)
    assert result.status == "FAIL"
    codes = {issue.code for issue in result.issues}
    assert "MISSING_HUMAN_GATE" in codes
    gate = next(issue for issue in result.issues if issue.code == "MISSING_HUMAN_GATE")
    assert gate.witness_path


def test_guarded_repair_fixes_missing_gate():
    ir = _load("missing_gate.json")
    spec = compile_spec("完整出题。")
    report = verify_repair_loop(ir, spec, max_iterations=3)
    assert report.improved
    assert report.final.status == "PASS"
    assert check_workflow(report.ir) == []


def test_guarded_repair_fixes_missing_bounds():
    ir = _load("missing_bounds.json")
    spec = compile_spec("完整出题。")
    report = verify_repair_loop(ir, spec, max_iterations=3)
    assert report.final.status == "PASS"


def test_hardcoded_secret_is_safety_fail():
    ir = _load("valid_lis.json")
    dumped = ir.model_dump(by_alias=True)
    dumped["nodes"][0]["config"] = {"api_key": "sk-live-secret"}
    ir = WorkflowIR.model_validate(dumped)
    spec = compile_spec("完整出题。")
    result = verify_workflow(ir, spec)
    assert any(issue.code == "HARDCODED_SECRET" for issue in result.issues)
    report = verify_repair_loop(ir, spec, max_iterations=3)
    assert not any(issue.code == "HARDCODED_SECRET" for issue in report.final.issues)


def test_repair_loop_caps_iterations():
    ir = _load("missing_gate.json")
    spec = compile_spec("完整出题。")
    report = verify_repair_loop(ir, spec, max_iterations=1)
    assert report.iterations <= 1


def test_mutate_wrong_order_detected():
    gold = _load("valid_lis.json")
    mutated = mutate_ir(gold, "wrong_order")
    spec = compile_spec("完整出题。")
    result = verify_workflow(mutated.ir, spec)
    assert result.status == "FAIL"
    assert mutated.expected_detection


def test_compose_json_adapter_class():
    assert ComposeJsonAdapter().name == "compose-json"
