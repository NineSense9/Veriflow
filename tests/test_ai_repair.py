import json
from pathlib import Path

from veriflow_ir.workflow import WorkflowIR
from veriflow_repair.ai_planner import propose_ai_patches
from veriflow_spec.compiler import compile_spec
from veriflow_verify.result import verify_workflow

ROOT = Path(__file__).resolve().parents[1]


def _missing_gate():
    ir = WorkflowIR.model_validate_json((ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8"))
    spec = compile_spec("完整出题：生成器、范围守卫、审题门、入库。")
    result = verify_workflow(ir, spec)
    return ir, spec, result.issues


def test_ai_malformed_json_rejected():
    ir, spec, issues = _missing_gate()
    plans, reason, _meta = propose_ai_patches(ir, spec, issues, complete_fn=lambda _m: "not-json")
    assert plans == []
    assert reason == "malformed_json"


def test_ai_invalid_operation_rejected():
    ir, spec, issues = _missing_gate()
    payload = {"candidates": [{"patches": [{"operation": "explode", "node_id": "x"}]}]}
    plans, reason, _meta = propose_ai_patches(ir, spec, issues, complete_fn=lambda _m: json.dumps(payload))
    assert plans == []
    assert reason in {"invalid_patch_schema", "invalid_operation"}


def test_ai_forbidden_tool_rejected():
    ir, spec, issues = _missing_gate()
    payload = {
        "candidates": [
            {
                "patches": [
                    {
                        "operation": "add_node",
                        "node_id": "x",
                        "kind": "tool",
                        "tool": "curl",
                        "node": {"id": "x", "kind": "tool", "tool": "curl"},
                    }
                ]
            }
        ]
    }
    plans, reason, _meta = propose_ai_patches(ir, spec, issues, complete_fn=lambda _m: json.dumps(payload))
    assert plans == []
    assert reason == "forbidden_tool"


def test_ai_nested_forbidden_tool_rejected():
    ir, spec, issues = _missing_gate()
    payload = {
        "candidates": [
            {
                "patches": [
                    {
                        "operation": "add_node",
                        "node_id": "evil",
                        "node": {"id": "evil", "kind": "tool", "tool": "curl"},
                    }
                ]
            }
        ]
    }
    plans, reason, _meta = propose_ai_patches(ir, spec, issues, complete_fn=lambda _m: json.dumps(payload))
    assert plans == []
    assert reason == "forbidden_tool"


def test_guard_rejects_nested_forbidden_tool():
    from veriflow_repair.guard import validate_patches
    from veriflow_repair.patch import Patch

    ir, _spec, _issues = _missing_gate()
    patch = Patch.model_validate(
        {
            "operation": "add_node",
            "node_id": "evil",
            "node": {"id": "evil", "kind": "tool", "tool": "curl"},
        }
    )
    ok, reason = validate_patches(ir, [patch])
    assert ok is False
    assert "whitelist" in reason


def test_ai_empty_falls_back_reason():
    ir, spec, issues = _missing_gate()
    plans, reason, _meta = propose_ai_patches(ir, spec, issues, complete_fn=lambda _m: "")
    assert plans == []
    assert reason == "empty"
