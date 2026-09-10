import pytest
from pydantic import ValidationError

from veriflow_ir.workflow import NODE_KINDS, WorkflowIR


def _compose_payload() -> dict:
    return {
        "ir_version": "1.0",
        "domain": "compose",
        "name": "vf1012_compose",
        "nodes": [
            {
                "id": "gen",
                "kind": "tool",
                "tool": "test_generator",
                "in_type": {"type": "object", "required": ["spec"]},
                "out_type": {"type": "object", "required": ["tests"]},
            },
            {
                "id": "g_bounds",
                "kind": "guard",
                "expr": "spec.n_min >= 1 && spec.n_max <= 100000",
                "on_fail": "reject",
            },
            {
                "id": "review",
                "kind": "human_gate",
                "assignee_role": "problemsetter",
                "on_fail": "reject",
            },
            {"id": "pub", "kind": "tool", "tool": "publish_problem"},
        ],
        "edges": [
            {"from": "gen", "to": "g_bounds"},
            {"from": "g_bounds", "to": "review"},
            {"from": "review", "to": "pub"},
        ],
    }


def test_parse_valid_compose_ir():
    ir = WorkflowIR.model_validate(_compose_payload())
    assert ir.name == "vf1012_compose"
    assert ir.node_map()["pub"].tool == "publish_problem"
    assert set(NODE_KINDS) == {
        "tool",
        "guard",
        "human_gate",
        "transform",
        "branch",
        "notify",
    }


def test_reject_unknown_kind():
    with pytest.raises(ValidationError):
        WorkflowIR.model_validate(
            {
                "ir_version": "1.0",
                "domain": "compose",
                "name": "bad",
                "nodes": [{"id": "a", "kind": "magic"}],
                "edges": [],
            }
        )


def test_reject_wrong_version():
    with pytest.raises(ValidationError):
        WorkflowIR.model_validate(
            {
                "ir_version": "2.0",
                "domain": "compose",
                "name": "bad",
                "nodes": [],
                "edges": [],
            }
        )


def test_reject_duplicate_node_id():
    payload = _compose_payload()
    payload["nodes"].append({"id": "gen", "kind": "transform"})
    with pytest.raises(ValidationError):
        WorkflowIR.model_validate(payload)
