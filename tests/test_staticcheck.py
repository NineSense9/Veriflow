import json
from pathlib import Path

from veriflow_ir.workflow import WorkflowIR
from veriflow_staticcheck.check import check_workflow

ROOT = Path(__file__).resolve().parents[1]


def _codes(ir: WorkflowIR) -> set[str]:
    return {error.code for error in check_workflow(ir)}


def test_valid_compose_has_no_errors():
    ir = WorkflowIR.model_validate_json(
        (ROOT / "examples/compose/valid_lis.json").read_text(encoding="utf-8")
    )
    assert check_workflow(ir) == []


def test_missing_human_gate():
    ir = WorkflowIR.model_validate_json(
        (ROOT / "examples/compose/missing_gate.json").read_text(encoding="utf-8")
    )
    assert "MISSING_HUMAN_GATE" in _codes(ir)


def test_type_mismatch():
    ir = WorkflowIR.model_validate(
        {
            "ir_version": "1.0",
            "domain": "compose",
            "name": "types",
            "nodes": [
                {
                    "id": "gen",
                    "kind": "tool",
                    "tool": "test_generator",
                    "out_type": {"type": "object"},
                },
                {
                    "id": "review",
                    "kind": "human_gate",
                    "on_fail": "reject",
                    "in_type": {"type": "string"},
                },
                {"id": "pub", "kind": "tool", "tool": "publish_problem"},
            ],
            "edges": [
                {"from": "gen", "to": "review"},
                {"from": "review", "to": "pub"},
            ],
        }
    )
    assert "TYPE_MISMATCH" in _codes(ir)


def test_undef_var():
    ir = WorkflowIR.model_validate(
        {
            "ir_version": "1.0",
            "domain": "compose",
            "name": "undef",
            "nodes": [
                {"id": "gen", "kind": "tool", "tool": "test_generator"},
                {
                    "id": "g",
                    "kind": "guard",
                    "expr": "invoice.amount > 0",
                    "on_fail": "reject",
                },
                {
                    "id": "review",
                    "kind": "human_gate",
                    "on_fail": "reject",
                },
                {"id": "pub", "kind": "tool", "tool": "publish_problem"},
            ],
            "edges": [
                {"from": "gen", "to": "g"},
                {"from": "g", "to": "review"},
                {"from": "review", "to": "pub"},
            ],
        }
    )
    assert "UNDEF_VAR" in _codes(ir)


def test_dead_node():
    ir = WorkflowIR.model_validate(
        {
            "ir_version": "1.0",
            "domain": "compose",
            "name": "dead",
            "nodes": [
                {"id": "gen", "kind": "tool", "tool": "test_generator"},
                {
                    "id": "review",
                    "kind": "human_gate",
                    "on_fail": "reject",
                },
                {"id": "pub", "kind": "tool", "tool": "publish_problem"},
                {"id": "orphan", "kind": "transform"},
            ],
            "edges": [
                {"from": "gen", "to": "review"},
                {"from": "review", "to": "pub"},
            ],
        }
    )
    assert "DEAD_NODE" in _codes(ir)


def test_guard_not_expr():
    ir = WorkflowIR.model_validate(
        {
            "ir_version": "1.0",
            "domain": "compose",
            "name": "nl_guard",
            "nodes": [
                {"id": "gen", "kind": "tool", "tool": "test_generator"},
                {
                    "id": "g",
                    "kind": "guard",
                    "expr": "金额看起来对",
                    "on_fail": "reject",
                },
                {
                    "id": "review",
                    "kind": "human_gate",
                    "on_fail": "reject",
                },
                {"id": "pub", "kind": "tool", "tool": "publish_problem"},
            ],
            "edges": [
                {"from": "gen", "to": "g"},
                {"from": "g", "to": "review"},
                {"from": "review", "to": "pub"},
            ],
        }
    )
    assert "GUARD_NOT_EXPR" in _codes(ir)


def test_tool_not_allowed():
    ir = WorkflowIR.model_validate(
        {
            "ir_version": "1.0",
            "domain": "compose",
            "name": "ocr",
            "nodes": [
                {"id": "ocr", "kind": "tool", "tool": "invoice_ocr"},
                {
                    "id": "review",
                    "kind": "human_gate",
                    "on_fail": "reject",
                },
                {"id": "pub", "kind": "tool", "tool": "publish_problem"},
            ],
            "edges": [
                {"from": "ocr", "to": "review"},
                {"from": "review", "to": "pub"},
            ],
        }
    )
    assert "TOOL_NOT_ALLOWED" in _codes(ir)


def test_missing_on_fail():
    ir = WorkflowIR.model_validate(
        {
            "ir_version": "1.0",
            "domain": "compose",
            "name": "no_fail",
            "nodes": [
                {"id": "gen", "kind": "tool", "tool": "test_generator"},
                {"id": "review", "kind": "human_gate"},
                {"id": "pub", "kind": "tool", "tool": "publish_problem"},
            ],
            "edges": [
                {"from": "gen", "to": "review"},
                {"from": "review", "to": "pub"},
            ],
        }
    )
    assert "MISSING_ON_FAIL" in _codes(ir)


def test_examples_on_disk_are_valid_json():
    for name in ("valid_lis.json", "missing_gate.json"):
        json.loads((ROOT / "examples/compose" / name).read_text(encoding="utf-8"))
